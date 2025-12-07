import type { Client } from '@libsql/client';
import type { Entry, Project, EntryRelation, Config } from '../types.js';
import { loadConfig, getUniKortexHome } from '../utils/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SYNC_STATE_FILE = 'sync-state.json';

interface SyncState {
  lastSyncAt: string | null; // ISO timestamp of last successful sync
  deviceId: string; // Unique device identifier
}

interface SyncResult {
  pulled: {
    entries: number;
    projects: number;
    relations: number;
  };
  pushed: {
    entries: number;
    projects: number;
    relations: number;
  };
  errors: string[];
}

/**
 * Service for syncing data with a remote Turso database
 *
 * Architecture:
 * - Remote Turso DB stores: entries, projects, relations (without vectors)
 * - Local SQLite stores: same data + vector embeddings
 * - On write: save locally → push to Turso
 * - On read: pull from Turso (delta sync) → re-index new entries locally
 */
export class TursoSyncService {
  private client: Client | null = null;
  private config: Config;
  private syncState: SyncState;
  private initialized = false;

  constructor(config?: Config) {
    this.config = config ?? loadConfig();
    this.syncState = this.loadSyncState();
  }

  /**
   * Check if sync is enabled in config
   */
  isEnabled(): boolean {
    return this.config.sync?.enabled === true && !!this.config.sync?.url;
  }

  /**
   * Initialize connection to Turso
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.isEnabled()) {
      throw new Error('Sync is not enabled. Configure sync.url in config.yaml');
    }

    try {
      // Dynamic import to handle optional dependency
      const { createClient } = await import('@libsql/client');

      this.client = createClient({
        url: this.config.sync!.url,
        authToken: this.config.sync!.authToken,
      });

      // Create remote schema if needed
      await this.createRemoteSchema();
      this.initialized = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'Turso sync requires @libsql/client. Install it with: npm install @libsql/client'
        );
      }
      throw error;
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.initialized = false;
    }
  }

  /**
   * Create the remote database schema
   */
  private async createRemoteSchema(): Promise<void> {
    const client = this.getClient();

    await client.batch([
      // Projects table
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,

      // Entries table (no vector columns)
      `CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        content TEXT NOT NULL,
        context_summary TEXT,
        supersedes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        version INTEGER DEFAULT 1,
        checksum TEXT
      )`,

      // Entry tags
      `CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (entry_id, tag)
      )`,

      // Entry relations
      `CREATE TABLE IF NOT EXISTS entry_relations (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        relation_type TEXT NOT NULL DEFAULT 'related',
        PRIMARY KEY (from_id, to_id)
      )`,

      // Indexes for sync queries
      `CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_entries_deleted ON entries(deleted_at)`,
    ]);
  }

  /**
   * Pull changes from remote since last sync
   */
  async pull(): Promise<SyncResult['pulled']> {
    const client = this.getClient();
    const lastSync = this.syncState.lastSyncAt;

    const result = {
      entries: 0,
      projects: 0,
      relations: 0,
    };

    // Pull projects
    const projectsQuery = lastSync
      ? `SELECT * FROM projects WHERE updated_at > ? OR deleted_at > ?`
      : `SELECT * FROM projects WHERE deleted_at IS NULL`;

    const projectsResult = await client.execute({
      sql: projectsQuery,
      args: lastSync ? [lastSync, lastSync] : [],
    });
    result.projects = projectsResult.rows.length;

    // Pull entries
    const entriesQuery = lastSync
      ? `SELECT * FROM entries WHERE updated_at > ? OR deleted_at > ?`
      : `SELECT * FROM entries WHERE deleted_at IS NULL`;

    const entriesResult = await client.execute({
      sql: entriesQuery,
      args: lastSync ? [lastSync, lastSync] : [],
    });
    result.entries = entriesResult.rows.length;

    // Note: Tags are pulled per-entry in pullAll() method

    // Pull relations (simplified - pull all if any entries changed)
    if (entriesResult.rows.length > 0 || !lastSync) {
      const relationsResult = await client.execute('SELECT * FROM entry_relations');
      result.relations = relationsResult.rows.length;
    }

    return result;
  }

  /**
   * Pull all data from remote (used for initial sync or full refresh)
   */
  async pullAll(): Promise<{
    projects: Project[];
    entries: Entry[];
    relations: EntryRelation[];
    tags: Map<string, string[]>;
  }> {
    const client = this.getClient();

    // Fetch all active data
    const [projectsResult, entriesResult, relationsResult, tagsResult] = await Promise.all([
      client.execute('SELECT * FROM projects WHERE deleted_at IS NULL'),
      client.execute('SELECT * FROM entries WHERE deleted_at IS NULL'),
      client.execute('SELECT * FROM entry_relations'),
      client.execute('SELECT * FROM entry_tags'),
    ]);

    // Build tags map
    const tags = new Map<string, string[]>();
    for (const row of tagsResult.rows) {
      const entryId = row.entry_id as string;
      const tag = row.tag as string;
      if (!tags.has(entryId)) {
        tags.set(entryId, []);
      }
      tags.get(entryId)!.push(tag);
    }

    // Convert rows to objects
    const projects = projectsResult.rows.map((row) => this.rowToProject(row));
    const entries = entriesResult.rows.map((row) => {
      const entry = this.rowToEntry(row);
      entry.tags = tags.get(entry.id) ?? [];
      return entry;
    });
    const relations = relationsResult.rows.map((row) => this.rowToRelation(row));

    // Update sync state
    this.updateSyncState();

    return { projects, entries, relations, tags };
  }

  /**
   * Push a project to remote
   */
  async pushProject(project: Project): Promise<void> {
    const client = this.getClient();

    await client.execute({
      sql: `INSERT OR REPLACE INTO projects (id, name, display_name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        project.id,
        project.name,
        project.displayName,
        project.description ?? null,
        project.createdAt.toISOString(),
        project.updatedAt.toISOString(),
      ],
    });
  }

  /**
   * Push an entry to remote
   */
  async pushEntry(entry: Entry): Promise<void> {
    const client = this.getClient();

    await client.batch([
      // Upsert entry
      {
        sql: `INSERT OR REPLACE INTO entries (
                id, project_id, title, type, status, content,
                context_summary, supersedes, created_at, updated_at, version, checksum
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          entry.id,
          entry.projectId,
          entry.title,
          entry.type,
          entry.status,
          entry.content,
          entry.contextSummary ?? null,
          entry.supersedes ?? null,
          entry.createdAt.toISOString(),
          entry.updatedAt.toISOString(),
          entry.version,
          entry.checksum ?? null,
        ],
      },
      // Delete existing tags
      {
        sql: 'DELETE FROM entry_tags WHERE entry_id = ?',
        args: [entry.id],
      },
      // Insert new tags
      ...entry.tags.map((tag) => ({
        sql: 'INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)',
        args: [entry.id, tag],
      })),
    ]);
  }

  /**
   * Push a relation to remote
   */
  async pushRelation(relation: EntryRelation): Promise<void> {
    const client = this.getClient();

    await client.execute({
      sql: `INSERT OR REPLACE INTO entry_relations (from_id, to_id, relation_type)
            VALUES (?, ?, ?)`,
      args: [relation.fromId, relation.toId, relation.relationType],
    });
  }

  /**
   * Soft delete a project on remote
   */
  async deleteProject(projectId: string): Promise<void> {
    const client = this.getClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: 'UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [now, now, projectId],
    });
  }

  /**
   * Soft delete an entry on remote
   */
  async deleteEntry(entryId: string): Promise<void> {
    const client = this.getClient();
    const now = new Date().toISOString();

    await client.execute({
      sql: 'UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [now, now, entryId],
    });
  }

  /**
   * Delete a relation from remote
   */
  async deleteRelation(fromId: string, toId: string): Promise<void> {
    const client = this.getClient();

    await client.execute({
      sql: 'DELETE FROM entry_relations WHERE from_id = ? AND to_id = ?',
      args: [fromId, toId],
    });
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncAt(): Date | null {
    return this.syncState.lastSyncAt ? new Date(this.syncState.lastSyncAt) : null;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.syncState.deviceId;
  }

  // === Private Helpers ===

  private getClient(): Client {
    if (!this.client) {
      throw new Error('TursoSyncService not initialized. Call initialize() first.');
    }
    return this.client;
  }

  private loadSyncState(): SyncState {
    const statePath = path.join(getUniKortexHome(), SYNC_STATE_FILE);

    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        return JSON.parse(content) as SyncState;
      } catch {
        // Corrupted state, reset
      }
    }

    // Generate new device ID
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const state: SyncState = {
      lastSyncAt: null,
      deviceId,
    };
    this.saveSyncState(state);
    return state;
  }

  private saveSyncState(state: SyncState): void {
    const statePath = path.join(getUniKortexHome(), SYNC_STATE_FILE);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  private updateSyncState(): void {
    this.syncState.lastSyncAt = new Date().toISOString();
    this.saveSyncState(this.syncState);
  }

  private rowToProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      description: (row.description as string) ?? undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToEntry(row: Record<string, unknown>): Entry {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      title: row.title as string,
      type: row.type as Entry['type'],
      status: row.status as Entry['status'],
      content: row.content as string,
      contextSummary: (row.context_summary as string) ?? undefined,
      supersedes: (row.supersedes as string) ?? undefined,
      tags: [], // Will be populated separately
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      version: row.version as number,
      checksum: (row.checksum as string) ?? undefined,
    };
  }

  private rowToRelation(row: Record<string, unknown>): EntryRelation {
    return {
      fromId: row.from_id as string,
      toId: row.to_id as string,
      relationType: row.relation_type as EntryRelation['relationType'],
    };
  }
}

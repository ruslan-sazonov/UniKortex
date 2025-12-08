import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { Storage, StorageError, StorageErrorCodes } from './interface.js';
import type {
  Entry,
  Project,
  EntryRelation,
  CreateEntryInput,
  UpdateEntryInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateRelationInput,
  EntryFilters,
  PaginatedResult,
  UpsertProjectInput,
  UpsertEntryInput,
} from '../types.js';
import { generateEntryId, generateProjectId } from '../utils/id.js';
import { getDatabasePath } from '../utils/config.js';

/**
 * SQLite storage implementation for personal mode
 */
export class SQLiteStorage implements Storage {
  private db: DatabaseType | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDatabasePath();
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);

    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.createSchema();
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): DatabaseType {
    if (!this.db) {
      throw new StorageError('Database not initialized', StorageErrorCodes.CONNECTION_ERROR);
    }
    return this.db;
  }

  private createSchema(): void {
    const db = this.getDb();

    db.exec(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Entries table
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('decision', 'research', 'artifact', 'note', 'reference')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'superseded', 'archived')),
        content TEXT NOT NULL,
        context_summary TEXT,

        supersedes TEXT REFERENCES entries(id) ON DELETE SET NULL,

        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),

        version INTEGER DEFAULT 1,
        checksum TEXT
      );

      -- Entry tags (many-to-many)
      CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (entry_id, tag)
      );

      -- Entry relations
      CREATE TABLE IF NOT EXISTS entry_relations (
        from_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL DEFAULT 'related'
          CHECK(relation_type IN ('related', 'implements', 'extends', 'contradicts')),
        PRIMARY KEY (from_id, to_id)
      );

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        title,
        content,
        context_summary,
        content='entries',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, title, content, context_summary)
        VALUES (NEW.rowid, NEW.title, NEW.content, NEW.context_summary);
      END;

      CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, context_summary)
        VALUES('delete', OLD.rowid, OLD.title, OLD.content, OLD.context_summary);
      END;

      CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, context_summary)
        VALUES('delete', OLD.rowid, OLD.title, OLD.content, OLD.context_summary);
        INSERT INTO entries_fts(rowid, title, content, context_summary)
        VALUES (NEW.rowid, NEW.title, NEW.content, NEW.context_summary);
      END;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
      CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at);
      CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);
    `);
  }

  // === Projects ===

  async createProject(input: CreateProjectInput): Promise<Project> {
    const db = this.getDb();
    const id = generateProjectId();
    const now = new Date().toISOString();

    try {
      const stmt = db.prepare(`
        INSERT INTO projects (id, name, display_name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(id, input.name, input.displayName, input.description ?? null, now, now);

      return {
        id,
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new StorageError(
          `Project with name "${input.name}" already exists`,
          StorageErrorCodes.ALREADY_EXISTS,
          error
        );
      }
      throw new StorageError('Failed to create project', StorageErrorCodes.UNKNOWN, error);
    }
  }

  async getProject(id: string): Promise<Project | null> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as ProjectRow | undefined;

    return row ? this.rowToProject(row) : null;
  }

  async getProjectByName(name: string): Promise<Project | null> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE name = ?');
    const row = stmt.get(name) as ProjectRow | undefined;

    return row ? this.rowToProject(row) : null;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project | null> {
    const db = this.getDb();
    const existing = await this.getProject(id);

    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(input.displayName);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    const now = new Date().toISOString();
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getProject(id);
  }

  async deleteProject(id: string): Promise<boolean> {
    const db = this.getDb();
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async listProjects(): Promise<Project[]> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM projects ORDER BY name');
    const rows = stmt.all() as ProjectRow[];
    return rows.map((row) => this.rowToProject(row));
  }

  async upsertProject(input: UpsertProjectInput): Promise<Project> {
    const db = this.getDb();

    try {
      const stmt = db.prepare(`
        INSERT INTO projects (id, name, display_name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          display_name = excluded.display_name,
          description = excluded.description,
          updated_at = excluded.updated_at
      `);

      stmt.run(
        input.id,
        input.name,
        input.displayName,
        input.description ?? null,
        input.createdAt.toISOString(),
        input.updatedAt.toISOString()
      );

      return {
        id: input.id,
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
    } catch (error) {
      throw new StorageError('Failed to upsert project', StorageErrorCodes.UNKNOWN, error);
    }
  }

  // === Entries ===

  async createEntry(input: CreateEntryInput): Promise<Entry> {
    const db = this.getDb();
    const id = generateEntryId();
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO entries (
          id, project_id, title, type, status, content,
          context_summary, supersedes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        input.projectId,
        input.title,
        input.type,
        input.status ?? 'active',
        input.content,
        input.contextSummary ?? null,
        input.supersedes ?? null,
        now,
        now
      );

      // Insert tags
      if (input.tags && input.tags.length > 0) {
        const tagStmt = db.prepare('INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)');
        for (const tag of input.tags) {
          tagStmt.run(id, tag);
        }
      }

      return id;
    });

    try {
      transaction();

      return {
        id,
        projectId: input.projectId,
        title: input.title,
        type: input.type,
        status: input.status ?? 'active',
        content: input.content,
        contextSummary: input.contextSummary,
        tags: input.tags ?? [],
        supersedes: input.supersedes ?? null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        version: 1,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new StorageError(
          `Project "${input.projectId}" not found`,
          StorageErrorCodes.NOT_FOUND,
          error
        );
      }
      throw new StorageError('Failed to create entry', StorageErrorCodes.UNKNOWN, error);
    }
  }

  async getEntry(id: string): Promise<Entry | null> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM entries WHERE id = ?');
    const row = stmt.get(id) as EntryRow | undefined;

    if (!row) {
      return null;
    }

    const tags = await this.getEntryTags(id);
    return this.rowToEntry(row, tags);
  }

  async updateEntry(id: string, input: UpdateEntryInput): Promise<Entry | null> {
    const db = this.getDb();
    const existing = await this.getEntry(id);

    if (!existing) {
      return null;
    }

    const transaction = db.transaction(() => {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (input.title !== undefined) {
        updates.push('title = ?');
        values.push(input.title);
      }
      if (input.type !== undefined) {
        updates.push('type = ?');
        values.push(input.type);
      }
      if (input.status !== undefined) {
        updates.push('status = ?');
        values.push(input.status);
      }
      if (input.content !== undefined) {
        updates.push('content = ?');
        values.push(input.content);
      }
      if (input.contextSummary !== undefined) {
        updates.push('context_summary = ?');
        values.push(input.contextSummary);
      }
      if (input.supersedes !== undefined) {
        updates.push('supersedes = ?');
        values.push(input.supersedes);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        updates.push('version = version + 1');
        values.push(new Date().toISOString());
        values.push(id);

        const stmt = db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      // Update tags if provided
      if (input.tags !== undefined) {
        db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(id);
        const tagStmt = db.prepare('INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)');
        for (const tag of input.tags) {
          tagStmt.run(id, tag);
        }
      }
    });

    transaction();
    return this.getEntry(id);
  }

  async deleteEntry(id: string): Promise<boolean> {
    const db = this.getDb();
    const stmt = db.prepare('DELETE FROM entries WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async listEntries(filters?: EntryFilters): Promise<PaginatedResult<Entry>> {
    const db = this.getDb();
    const { where, params } = this.buildEntryFilters(filters);

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM entries ${where}`);
    const countResult = countStmt.get(...params) as { count: number };

    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT * FROM entries ${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(...params, limit, offset) as EntryRow[];

    const entries: Entry[] = [];
    for (const row of rows) {
      const tags = await this.getEntryTags(row.id);
      entries.push(this.rowToEntry(row, tags));
    }

    return {
      items: entries,
      total: countResult.count,
      limit,
      offset,
    };
  }

  async upsertEntry(input: UpsertEntryInput): Promise<Entry> {
    const db = this.getDb();

    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO entries (
          id, project_id, title, type, status, content,
          context_summary, supersedes, created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          type = excluded.type,
          status = excluded.status,
          content = excluded.content,
          context_summary = excluded.context_summary,
          supersedes = excluded.supersedes,
          updated_at = excluded.updated_at,
          version = excluded.version
      `);

      stmt.run(
        input.id,
        input.projectId,
        input.title,
        input.type,
        input.status ?? 'active',
        input.content,
        input.contextSummary ?? null,
        input.supersedes ?? null,
        input.createdAt.toISOString(),
        input.updatedAt.toISOString(),
        input.version ?? 1
      );

      // Upsert tags - delete existing and insert new
      db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(input.id);
      if (input.tags && input.tags.length > 0) {
        const tagStmt = db.prepare('INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)');
        for (const tag of input.tags) {
          tagStmt.run(input.id, tag);
        }
      }
    });

    try {
      transaction();

      return {
        id: input.id,
        projectId: input.projectId,
        title: input.title,
        type: input.type,
        status: input.status ?? 'active',
        content: input.content,
        contextSummary: input.contextSummary,
        tags: input.tags ?? [],
        supersedes: input.supersedes ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        version: input.version ?? 1,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new StorageError(
          `Project "${input.projectId}" not found`,
          StorageErrorCodes.NOT_FOUND,
          error
        );
      }
      throw new StorageError('Failed to upsert entry', StorageErrorCodes.UNKNOWN, error);
    }
  }

  // === Tags ===

  async getEntryTags(entryId: string): Promise<string[]> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT tag FROM entry_tags WHERE entry_id = ? ORDER BY tag');
    const rows = stmt.all(entryId) as { tag: string }[];
    return rows.map((row) => row.tag);
  }

  async setEntryTags(entryId: string, tags: string[]): Promise<void> {
    const db = this.getDb();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
      const stmt = db.prepare('INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)');
      for (const tag of tags) {
        stmt.run(entryId, tag);
      }
    });
    transaction();
  }

  async getAllTags(): Promise<string[]> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT DISTINCT tag FROM entry_tags ORDER BY tag');
    const rows = stmt.all() as { tag: string }[];
    return rows.map((row) => row.tag);
  }

  // === Relations ===

  async createRelation(input: CreateRelationInput): Promise<EntryRelation> {
    const db = this.getDb();

    try {
      const stmt = db.prepare(`
        INSERT INTO entry_relations (from_id, to_id, relation_type)
        VALUES (?, ?, ?)
      `);

      stmt.run(input.fromId, input.toId, input.relationType ?? 'related');

      return {
        fromId: input.fromId,
        toId: input.toId,
        relationType: input.relationType ?? 'related',
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new StorageError('Relation already exists', StorageErrorCodes.ALREADY_EXISTS, error);
      }
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new StorageError('One or both entries not found', StorageErrorCodes.NOT_FOUND, error);
      }
      throw new StorageError('Failed to create relation', StorageErrorCodes.UNKNOWN, error);
    }
  }

  async getRelation(fromId: string, toId: string): Promise<EntryRelation | null> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM entry_relations WHERE from_id = ? AND to_id = ?');
    const row = stmt.get(fromId, toId) as RelationRow | undefined;

    return row ? this.rowToRelation(row) : null;
  }

  async deleteRelation(fromId: string, toId: string): Promise<boolean> {
    const db = this.getDb();
    const stmt = db.prepare('DELETE FROM entry_relations WHERE from_id = ? AND to_id = ?');
    const result = stmt.run(fromId, toId);
    return result.changes > 0;
  }

  async getEntryRelations(entryId: string): Promise<EntryRelation[]> {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT * FROM entry_relations
      WHERE from_id = ? OR to_id = ?
      ORDER BY from_id, to_id
    `);
    const rows = stmt.all(entryId, entryId) as RelationRow[];
    return rows.map((row) => this.rowToRelation(row));
  }

  async getRelatedEntries(entryId: string): Promise<Entry[]> {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT e.* FROM entries e
      INNER JOIN entry_relations r ON (
        (r.from_id = ? AND r.to_id = e.id) OR
        (r.to_id = ? AND r.from_id = e.id)
      )
      ORDER BY e.updated_at DESC
    `);
    const rows = stmt.all(entryId, entryId) as EntryRow[];

    const entries: Entry[] = [];
    for (const row of rows) {
      const tags = await this.getEntryTags(row.id);
      entries.push(this.rowToEntry(row, tags));
    }
    return entries;
  }

  // === Search ===

  async searchEntries(query: string, filters?: EntryFilters): Promise<PaginatedResult<Entry>> {
    const db = this.getDb();

    // Build the filter conditions
    const filterConditions: string[] = [];
    const filterParams: unknown[] = [];

    if (filters?.projectId) {
      filterConditions.push('e.project_id = ?');
      filterParams.push(filters.projectId);
    }
    if (filters?.type && filters.type.length > 0) {
      filterConditions.push(`e.type IN (${filters.type.map(() => '?').join(', ')})`);
      filterParams.push(...filters.type);
    }
    if (filters?.status && filters.status.length > 0) {
      filterConditions.push(`e.status IN (${filters.status.map(() => '?').join(', ')})`);
      filterParams.push(...filters.status);
    }

    const filterWhere = filterConditions.length > 0 ? `AND ${filterConditions.join(' AND ')}` : '';

    // FTS5 search with ranking
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM entries e
      INNER JOIN entries_fts fts ON e.rowid = fts.rowid
      WHERE entries_fts MATCH ? ${filterWhere}
    `);

    const countResult = countStmt.get(query, ...filterParams) as { count: number };

    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;

    const stmt = db.prepare(`
      SELECT e.*, bm25(entries_fts) as rank
      FROM entries e
      INNER JOIN entries_fts fts ON e.rowid = fts.rowid
      WHERE entries_fts MATCH ? ${filterWhere}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(query, ...filterParams, limit, offset) as (EntryRow & {
      rank: number;
    })[];

    const entries: Entry[] = [];
    for (const row of rows) {
      const tags = await this.getEntryTags(row.id);
      entries.push(this.rowToEntry(row, tags));
    }

    return {
      items: entries,
      total: countResult.count,
      limit,
      offset,
    };
  }

  // === Helper Methods ===

  private buildEntryFilters(filters?: EntryFilters): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }

    if (filters?.type && filters.type.length > 0) {
      conditions.push(`type IN (${filters.type.map(() => '?').join(', ')})`);
      params.push(...filters.type);
    }

    if (filters?.status && filters.status.length > 0) {
      conditions.push(`status IN (${filters.status.map(() => '?').join(', ')})`);
      params.push(...filters.status);
    }

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`id IN (
        SELECT entry_id FROM entry_tags WHERE tag IN (${filters.tags.map(() => '?').join(', ')})
      )`);
      params.push(...filters.tags);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToEntry(row: EntryRow, tags: string[]): Entry {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      type: row.type as Entry['type'],
      status: row.status as Entry['status'],
      content: row.content,
      contextSummary: row.context_summary ?? undefined,
      tags,
      supersedes: row.supersedes ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      version: row.version,
      checksum: row.checksum ?? undefined,
    };
  }

  private rowToRelation(row: RelationRow): EntryRelation {
    return {
      fromId: row.from_id,
      toId: row.to_id,
      relationType: row.relation_type as EntryRelation['relationType'],
    };
  }
}

// === Row Types ===

interface ProjectRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  content: string;
  context_summary: string | null;
  supersedes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  checksum: string | null;
}

interface RelationRow {
  from_id: string;
  to_id: string;
  relation_type: string;
}

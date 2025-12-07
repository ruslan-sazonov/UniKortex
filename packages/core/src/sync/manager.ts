import type { Entry, Project, EntryRelation, Config } from '../types.js';
import type { Storage } from '../storage/interface.js';
import type { EmbeddingService } from '../embedding/service.js';
import type { VectorStore } from '../search/vector-store.js';
import { TursoSyncService } from './turso.js';
import { loadConfig } from '../utils/config.js';

interface SyncOptions {
  storage: Storage;
  embeddingService?: EmbeddingService;
  vectorStore?: VectorStore;
  config?: Config;
}

/**
 * SyncManager coordinates between local storage, remote Turso, and vector embeddings.
 *
 * Flow:
 * - On write: Local storage → Push to Turso → Update local vectors
 * - On pull: Fetch from Turso → Upsert to local storage → Re-index vectors
 */
export class SyncManager {
  private storage: Storage;
  private embeddingService?: EmbeddingService;
  private vectorStore?: VectorStore;
  private tursoSync: TursoSyncService;
  private config: Config;
  private initialized = false;

  constructor(options: SyncOptions) {
    this.storage = options.storage;
    this.embeddingService = options.embeddingService;
    this.vectorStore = options.vectorStore;
    this.config = options.config ?? loadConfig();
    this.tursoSync = new TursoSyncService(this.config);
  }

  /**
   * Check if remote sync is enabled
   */
  isEnabled(): boolean {
    return this.tursoSync.isEnabled();
  }

  /**
   * Initialize the sync manager (connects to Turso if enabled)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.isEnabled()) {
      await this.tursoSync.initialize();
    }

    this.initialized = true;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.tursoSync.close();
    this.initialized = false;
  }

  /**
   * Perform a full sync: pull from remote, merge with local, update vectors
   */
  async fullSync(): Promise<{
    entriesPulled: number;
    projectsPulled: number;
    entriesIndexed: number;
  }> {
    if (!this.isEnabled()) {
      return { entriesPulled: 0, projectsPulled: 0, entriesIndexed: 0 };
    }

    await this.initialize();

    const { projects, entries, relations } = await this.tursoSync.pullAll();

    // Upsert projects to local storage
    for (const project of projects) {
      const existing = await this.storage.getProject(project.id);
      if (!existing) {
        // Insert using raw data (skip validation since it's from trusted source)
        await this.upsertProject(project);
      } else if (project.updatedAt > existing.updatedAt) {
        await this.upsertProject(project);
      }
    }

    // Upsert entries to local storage
    const newOrUpdatedEntries: Entry[] = [];
    for (const entry of entries) {
      const existing = await this.storage.getEntry(entry.id);
      if (!existing) {
        await this.upsertEntry(entry);
        newOrUpdatedEntries.push(entry);
      } else if (entry.updatedAt > existing.updatedAt) {
        await this.upsertEntry(entry);
        newOrUpdatedEntries.push(entry);
      }
    }

    // Upsert relations
    for (const relation of relations) {
      const existing = await this.storage.getRelation(relation.fromId, relation.toId);
      if (!existing) {
        try {
          await this.storage.createRelation(relation);
        } catch {
          // Relation might already exist or entries might not exist
        }
      }
    }

    // Re-index new/updated entries
    let entriesIndexed = 0;
    if (this.embeddingService && this.vectorStore && newOrUpdatedEntries.length > 0) {
      for (const entry of newOrUpdatedEntries) {
        try {
          const text = `${entry.title}\n\n${entry.content}`;
          const embedding = await this.embeddingService.embed(text);
          await this.vectorStore.upsert(entry.id, embedding);
          entriesIndexed++;
        } catch (error) {
          console.warn(`Failed to index entry ${entry.id}:`, error);
        }
      }
    }

    return {
      entriesPulled: entries.length,
      projectsPulled: projects.length,
      entriesIndexed,
    };
  }

  /**
   * Pull changes since last sync
   */
  async pullChanges(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.initialize();

    // For now, do a full sync. Delta sync can be optimized later.
    await this.fullSync();
  }

  /**
   * Push a project to remote after local save
   */
  async pushProject(project: Project): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.pushProject(project);
  }

  /**
   * Push an entry to remote after local save
   */
  async pushEntry(entry: Entry): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.pushEntry(entry);
  }

  /**
   * Push a relation to remote after local save
   */
  async pushRelation(relation: EntryRelation): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.pushRelation(relation);
  }

  /**
   * Push a project deletion to remote
   */
  async pushProjectDeletion(projectId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.deleteProject(projectId);
  }

  /**
   * Push an entry deletion to remote
   */
  async pushEntryDeletion(entryId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.deleteEntry(entryId);
  }

  /**
   * Push a relation deletion to remote
   */
  async pushRelationDeletion(fromId: string, toId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.initialize();
    await this.tursoSync.deleteRelation(fromId, toId);
  }

  /**
   * Get sync status info
   */
  getSyncStatus(): {
    enabled: boolean;
    lastSyncAt: Date | null;
    deviceId: string;
  } {
    return {
      enabled: this.isEnabled(),
      lastSyncAt: this.tursoSync.getLastSyncAt(),
      deviceId: this.tursoSync.getDeviceId(),
    };
  }

  // === Private Helpers ===

  /**
   * Upsert a project directly to storage (bypassing service layer)
   */
  private async upsertProject(project: Project): Promise<void> {
    const existing = await this.storage.getProject(project.id);
    if (existing) {
      await this.storage.updateProject(project.id, {
        displayName: project.displayName,
        description: project.description,
      });
    } else {
      // Create using raw data - need to handle this at storage level
      await this.storage.createProject({
        name: project.name,
        displayName: project.displayName,
        description: project.description,
      });
    }
  }

  /**
   * Upsert an entry directly to storage (bypassing service layer)
   */
  private async upsertEntry(entry: Entry): Promise<void> {
    const existing = await this.storage.getEntry(entry.id);
    if (existing) {
      await this.storage.updateEntry(entry.id, {
        title: entry.title,
        type: entry.type,
        status: entry.status,
        content: entry.content,
        contextSummary: entry.contextSummary,
        tags: entry.tags,
        supersedes: entry.supersedes,
      });
    } else {
      await this.storage.createEntry({
        projectId: entry.projectId,
        title: entry.title,
        type: entry.type,
        status: entry.status,
        content: entry.content,
        contextSummary: entry.contextSummary,
        tags: entry.tags,
        supersedes: entry.supersedes,
      });
    }
  }
}

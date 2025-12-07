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
   * Perform a full bidirectional sync:
   * 1. Pull remote data and merge with local (newer wins)
   * 2. Push local data that's newer or doesn't exist remotely
   */
  async fullSync(): Promise<{
    entriesPulled: number;
    entriesPushed: number;
    projectsPulled: number;
    projectsPushed: number;
    entriesIndexed: number;
  }> {
    if (!this.isEnabled()) {
      return {
        entriesPulled: 0,
        entriesPushed: 0,
        projectsPulled: 0,
        projectsPushed: 0,
        entriesIndexed: 0,
      };
    }

    await this.initialize();

    // Step 1: Pull remote data
    const { projects: remoteProjects, entries: remoteEntries, relations: remoteRelations } =
      await this.tursoSync.pullAll();

    // Build maps for quick lookup
    const remoteProjectMap = new Map(remoteProjects.map((p) => [p.id, p]));
    const remoteEntryMap = new Map(remoteEntries.map((e) => [e.id, e]));
    const remoteRelationSet = new Set(remoteRelations.map((r) => `${r.fromId}:${r.toId}`));

    // Step 2: Get all local data
    const localProjects = await this.storage.listProjects();
    const localEntriesResult = await this.storage.listEntries({ limit: 10000 });
    const localEntries = localEntriesResult.items;

    let projectsPulled = 0;
    let projectsPushed = 0;
    let entriesPulled = 0;
    let entriesPushed = 0;
    const newOrUpdatedEntries: Entry[] = [];

    // Step 3: Merge projects (bidirectional)
    // 3a: Process remote projects - pull if newer or doesn't exist locally
    for (const remoteProject of remoteProjects) {
      const localProject = localProjects.find((p) => p.id === remoteProject.id);
      if (!localProject) {
        // Remote exists, local doesn't - pull
        await this.upsertProject(remoteProject);
        projectsPulled++;
      } else if (remoteProject.updatedAt > localProject.updatedAt) {
        // Remote is newer - pull
        await this.upsertProject(remoteProject);
        projectsPulled++;
      }
      // If local is newer, we'll push in the next loop
    }

    // 3b: Process local projects - push if newer or doesn't exist remotely
    for (const localProject of localProjects) {
      const remoteProject = remoteProjectMap.get(localProject.id);
      if (!remoteProject) {
        // Local exists, remote doesn't - push
        await this.tursoSync.pushProject(localProject);
        projectsPushed++;
      } else if (localProject.updatedAt > remoteProject.updatedAt) {
        // Local is newer - push
        await this.tursoSync.pushProject(localProject);
        projectsPushed++;
      }
    }

    // Step 4: Merge entries (bidirectional)
    // 4a: Process remote entries - pull if newer or doesn't exist locally
    for (const remoteEntry of remoteEntries) {
      const localEntry = localEntries.find((e) => e.id === remoteEntry.id);
      if (!localEntry) {
        // Remote exists, local doesn't - pull
        await this.upsertEntry(remoteEntry);
        newOrUpdatedEntries.push(remoteEntry);
        entriesPulled++;
      } else if (remoteEntry.updatedAt > localEntry.updatedAt) {
        // Remote is newer - pull
        await this.upsertEntry(remoteEntry);
        newOrUpdatedEntries.push(remoteEntry);
        entriesPulled++;
      }
    }

    // 4b: Process local entries - push if newer or doesn't exist remotely
    for (const localEntry of localEntries) {
      const remoteEntry = remoteEntryMap.get(localEntry.id);
      if (!remoteEntry) {
        // Local exists, remote doesn't - push
        await this.tursoSync.pushEntry(localEntry);
        entriesPushed++;
      } else if (localEntry.updatedAt > remoteEntry.updatedAt) {
        // Local is newer - push
        await this.tursoSync.pushEntry(localEntry);
        entriesPushed++;
      }
    }

    // Step 5: Sync relations (bidirectional)
    // 5a: Pull remote relations that don't exist locally
    for (const relation of remoteRelations) {
      const existing = await this.storage.getRelation(relation.fromId, relation.toId);
      if (!existing) {
        try {
          await this.storage.createRelation(relation);
        } catch {
          // Relation might already exist or entries might not exist
        }
      }
    }

    // 5b: Push local relations that don't exist remotely
    for (const localEntry of localEntries) {
      const relations = await this.storage.getEntryRelations(localEntry.id);
      for (const relation of relations) {
        const key = `${relation.fromId}:${relation.toId}`;
        if (!remoteRelationSet.has(key)) {
          await this.tursoSync.pushRelation(relation);
        }
      }
    }

    // Step 6: Re-index new/updated entries for vector search
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
      entriesPulled,
      entriesPushed,
      projectsPulled,
      projectsPushed,
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

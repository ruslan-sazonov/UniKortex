import type { Entry, Project, EntryRelation, Config } from '../types.js';
import type { Storage } from '../storage/interface.js';
import type { EmbeddingService } from '../embedding/service.js';
import type { VectorStore } from '../search/vector-store.js';
import { ManagedSyncService, type SyncPayload, type EntryTag } from './managed.js';
import { loadConfig } from '../utils/config.js';

interface SyncOptions {
  storage: Storage;
  embeddingService?: EmbeddingService;
  vectorStore?: VectorStore;
  config?: Config;
}

/**
 * SyncManager coordinates between local storage, remote sync service, and vector embeddings.
 *
 * Flow:
 * - On sync: Gather local data → Send to cloud service → Apply merged response locally
 * - Cloud service handles merge logic (newer wins by updatedAt)
 * - Turso is hidden from users - managed by cloud service
 */
export class SyncManager {
  private storage: Storage;
  private embeddingService?: EmbeddingService;
  private vectorStore?: VectorStore;
  private syncService: ManagedSyncService;
  private config: Config;
  private initialized = false;

  constructor(options: SyncOptions) {
    this.storage = options.storage;
    this.embeddingService = options.embeddingService;
    this.vectorStore = options.vectorStore;
    this.config = options.config ?? loadConfig();
    this.syncService = new ManagedSyncService(this.config);
  }

  /**
   * Check if remote sync is enabled
   */
  isEnabled(): boolean {
    return this.syncService.isEnabled();
  }

  /**
   * Initialize the sync manager (validates configuration)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.isEnabled()) {
      await this.syncService.initialize();
    }

    this.initialized = true;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.syncService.close();
    this.initialized = false;
  }

  /**
   * Perform a full bidirectional sync via the managed cloud service.
   *
   * Flow:
   * 1. Gather all local data (projects, entries, relations, tags)
   * 2. Send to cloud service
   * 3. Cloud service merges with remote data (newer wins by updatedAt)
   * 4. Apply merged response to local storage
   * 5. Re-index entries for vector search
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

    // Step 1: Gather all local data
    const localProjects = await this.storage.listProjects();
    const localEntriesResult = await this.storage.listEntries({ limit: 10000 });
    const localEntries = localEntriesResult.items;

    // Gather all relations
    const localRelations: EntryRelation[] = [];
    for (const entry of localEntries) {
      const relations = await this.storage.getEntryRelations(entry.id);
      for (const relation of relations) {
        // Avoid duplicates (relations are bidirectional in the response)
        if (!localRelations.some((r) => r.fromId === relation.fromId && r.toId === relation.toId)) {
          localRelations.push(relation);
        }
      }
    }

    // Convert entries to tags array
    const localTags: EntryTag[] = [];
    for (const entry of localEntries) {
      for (const tag of entry.tags) {
        localTags.push({ entryId: entry.id, tag });
      }
    }

    // Build local payload
    const localPayload: SyncPayload = {
      projects: localProjects,
      entries: localEntries,
      relations: localRelations,
      tags: localTags,
      lastSyncAt: this.syncService.getLastSyncAt()?.toISOString() ?? null,
    };

    // Build maps for comparing what changed
    const localProjectMap = new Map(localProjects.map((p) => [p.id, p]));
    const localEntryMap = new Map(localEntries.map((e) => [e.id, e]));
    const localRelationSet = new Set(localRelations.map((r) => `${r.fromId}:${r.toId}`));

    // Step 2: Send to cloud service and get merged response
    const mergedPayload = await this.syncService.fullSync(localPayload);

    // Step 3: Apply merged data to local storage
    let projectsPulled = 0;
    let entriesPulled = 0;
    const newOrUpdatedEntries: Entry[] = [];

    // Build tags map from merged payload
    const mergedTagsMap = new Map<string, string[]>();
    for (const tag of mergedPayload.tags) {
      if (!mergedTagsMap.has(tag.entryId)) {
        mergedTagsMap.set(tag.entryId, []);
      }
      mergedTagsMap.get(tag.entryId)!.push(tag.tag);
    }

    // Apply projects
    for (const project of mergedPayload.projects) {
      const localProject = localProjectMap.get(project.id);
      if (!localProject || project.updatedAt > localProject.updatedAt) {
        await this.upsertProject(project);
        if (!localProject) {
          projectsPulled++;
        }
      }
    }

    // Apply entries (with tags from merged payload)
    for (const entry of mergedPayload.entries) {
      const localEntry = localEntryMap.get(entry.id);
      // Attach tags from merged payload
      entry.tags = mergedTagsMap.get(entry.id) ?? [];

      if (!localEntry || entry.updatedAt > localEntry.updatedAt) {
        await this.upsertEntry(entry);
        newOrUpdatedEntries.push(entry);
        if (!localEntry) {
          entriesPulled++;
        }
      }
    }

    // Apply relations
    for (const relation of mergedPayload.relations) {
      const key = `${relation.fromId}:${relation.toId}`;
      if (!localRelationSet.has(key)) {
        const existing = await this.storage.getRelation(relation.fromId, relation.toId);
        if (!existing) {
          try {
            await this.storage.createRelation(relation);
          } catch {
            // Relation might already exist or entries might not exist
          }
        }
      }
    }

    // Calculate pushed counts (items that were in local but not in remote before sync)
    // Since cloud handles merge, we estimate based on what local had that remote didn't
    const mergedProjectIds = new Set(mergedPayload.projects.map((p) => p.id));
    const mergedEntryIds = new Set(mergedPayload.entries.map((e) => e.id));

    let projectsPushed = 0;
    let entriesPushed = 0;

    for (const project of localProjects) {
      // If we had a project locally that now appears in merged, we "pushed" it
      if (mergedProjectIds.has(project.id)) {
        const mergedProject = mergedPayload.projects.find((p) => p.id === project.id);
        // If local version was newer or equal, we consider it pushed
        if (mergedProject && project.updatedAt >= mergedProject.updatedAt) {
          projectsPushed++;
        }
      }
    }

    for (const entry of localEntries) {
      if (mergedEntryIds.has(entry.id)) {
        const mergedEntry = mergedPayload.entries.find((e) => e.id === entry.id);
        if (mergedEntry && entry.updatedAt >= mergedEntry.updatedAt) {
          entriesPushed++;
        }
      }
    }

    // Step 4: Re-index new/updated entries for vector search
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
   * Pull changes since last sync (triggers full sync)
   */
  async pullChanges(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.fullSync();
  }

  /**
   * Push a project to remote after local save.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushProject(_project: Project): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
  }

  /**
   * Push an entry to remote after local save.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushEntry(_entry: Entry): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
  }

  /**
   * Push a relation to remote after local save.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushRelation(_relation: EntryRelation): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
  }

  /**
   * Push a project deletion to remote.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushProjectDeletion(_projectId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
  }

  /**
   * Push an entry deletion to remote.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushEntryDeletion(_entryId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
  }

  /**
   * Push a relation deletion to remote.
   * With managed sync, this triggers a full sync if autoSync is enabled.
   */
  async pushRelationDeletion(_fromId: string, _toId: string): Promise<void> {
    if (!this.isEnabled() || !this.config.sync?.autoSync) return;
    await this.fullSync();
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
      lastSyncAt: this.syncService.getLastSyncAt(),
      deviceId: this.syncService.getDeviceId(),
    };
  }

  /**
   * Get the underlying sync service for direct access (e.g., token validation)
   */
  getSyncService(): ManagedSyncService {
    return this.syncService;
  }

  // === Private Helpers ===

  /**
   * Upsert a project directly to storage, preserving the original ID from remote
   */
  private async upsertProject(project: Project): Promise<void> {
    await this.storage.upsertProject({
      id: project.id,
      name: project.name,
      displayName: project.displayName,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  /**
   * Upsert an entry directly to storage, preserving the original ID from remote
   */
  private async upsertEntry(entry: Entry): Promise<void> {
    await this.storage.upsertEntry({
      id: entry.id,
      projectId: entry.projectId,
      title: entry.title,
      type: entry.type,
      status: entry.status,
      content: entry.content,
      contextSummary: entry.contextSummary,
      tags: entry.tags,
      supersedes: entry.supersedes,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      version: entry.version,
    });
  }
}

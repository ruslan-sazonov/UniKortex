import type { Entry, EntryRelation, CreateRelationInput } from '../types.js';
import type { Storage } from '../storage/interface.js';

/**
 * Service for managing entry relations
 */
export class RelationService {
  constructor(private storage: Storage) {}

  /**
   * Create a relation between two entries
   */
  async create(input: CreateRelationInput): Promise<EntryRelation> {
    // Validate that both entries exist
    const [fromEntry, toEntry] = await Promise.all([
      this.storage.getEntry(input.fromId),
      this.storage.getEntry(input.toId),
    ]);

    if (!fromEntry) {
      throw new Error(`Entry "${input.fromId}" not found`);
    }
    if (!toEntry) {
      throw new Error(`Entry "${input.toId}" not found`);
    }

    // Don't allow self-relations
    if (input.fromId === input.toId) {
      throw new Error('Cannot create a relation to the same entry');
    }

    return this.storage.createRelation(input);
  }

  /**
   * Get a specific relation
   */
  async get(fromId: string, toId: string): Promise<EntryRelation | null> {
    return this.storage.getRelation(fromId, toId);
  }

  /**
   * Delete a relation
   */
  async delete(fromId: string, toId: string): Promise<boolean> {
    return this.storage.deleteRelation(fromId, toId);
  }

  /**
   * Get all relations for an entry (both directions)
   */
  async getRelations(entryId: string): Promise<EntryRelation[]> {
    return this.storage.getEntryRelations(entryId);
  }

  /**
   * Get all entries related to a given entry
   */
  async getRelatedEntries(entryId: string): Promise<Entry[]> {
    return this.storage.getRelatedEntries(entryId);
  }

  /**
   * Get relations grouped by type
   */
  async getRelationsByType(
    entryId: string
  ): Promise<Record<EntryRelation['relationType'], EntryRelation[]>> {
    const relations = await this.getRelations(entryId);

    const grouped: Record<EntryRelation['relationType'], EntryRelation[]> = {
      related: [],
      implements: [],
      extends: [],
      contradicts: [],
    };

    for (const relation of relations) {
      grouped[relation.relationType].push(relation);
    }

    return grouped;
  }

  /**
   * Check if two entries are related
   */
  async areRelated(entryId1: string, entryId2: string): Promise<boolean> {
    const relation1 = await this.storage.getRelation(entryId1, entryId2);
    if (relation1) return true;

    const relation2 = await this.storage.getRelation(entryId2, entryId1);
    return relation2 !== null;
  }

  /**
   * Get entries that this entry supersedes
   */
  async getSupersededEntries(entryId: string): Promise<Entry[]> {
    const entry = await this.storage.getEntry(entryId);
    if (!entry?.supersedes) {
      return [];
    }

    const superseded = await this.storage.getEntry(entry.supersedes);
    if (!superseded) {
      return [];
    }

    // Recursively get entries that the superseded entry supersedes
    const chain = [superseded];
    const deeper = await this.getSupersededEntries(superseded.id);
    chain.push(...deeper);

    return chain;
  }

  /**
   * Get entries that supersede this entry
   */
  async getSupersedingEntries(entryId: string): Promise<Entry[]> {
    // This would require a reverse lookup - for now, we'd need to scan all entries
    // In a real implementation, we might add an index for this
    const allEntries = await this.storage.listEntries({ limit: 1000 });
    return allEntries.items.filter((e) => e.supersedes === entryId);
  }
}

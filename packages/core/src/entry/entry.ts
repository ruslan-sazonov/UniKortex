import {
  CreateEntryInput,
  UpdateEntryInput,
  Entry,
  EntrySchema,
  CreateEntryInput as CreateEntryInputSchema,
  UpdateEntryInput as UpdateEntryInputSchema,
} from '../types.js';
import type { Storage } from '../storage/interface.js';

/**
 * Service for managing entries
 */
export class EntryService {
  constructor(private storage: Storage) {}

  /**
   * Create a new entry
   */
  async create(input: CreateEntryInput): Promise<Entry> {
    // Validate input
    const validated = CreateEntryInputSchema.parse(input);

    // Auto-generate context summary if not provided
    if (!validated.contextSummary) {
      validated.contextSummary = this.generateContextSummary(validated.content, validated.type);
    }

    return this.storage.createEntry(validated);
  }

  /**
   * Get an entry by ID
   */
  async get(id: string): Promise<Entry | null> {
    return this.storage.getEntry(id);
  }

  /**
   * Update an entry
   */
  async update(id: string, input: UpdateEntryInput): Promise<Entry | null> {
    const validated = UpdateEntryInputSchema.parse(input);
    return this.storage.updateEntry(id, validated);
  }

  /**
   * Delete an entry
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.deleteEntry(id);
  }

  /**
   * List entries with optional filters
   */
  async list(filters?: Parameters<Storage['listEntries']>[0]) {
    return this.storage.listEntries(filters);
  }

  /**
   * Search entries using full-text search
   */
  async search(query: string, filters?: Parameters<Storage['listEntries']>[0]) {
    return this.storage.searchEntries(query, filters);
  }

  /**
   * Get all tags for an entry
   */
  async getTags(entryId: string): Promise<string[]> {
    return this.storage.getEntryTags(entryId);
  }

  /**
   * Set tags for an entry
   */
  async setTags(entryId: string, tags: string[]): Promise<void> {
    return this.storage.setEntryTags(entryId, tags);
  }

  /**
   * Get all unique tags across all entries
   */
  async getAllTags(): Promise<string[]> {
    return this.storage.getAllTags();
  }

  /**
   * Validate an entry object
   */
  validate(entry: unknown): Entry {
    return EntrySchema.parse(entry);
  }

  /**
   * Auto-generate a context summary from content
   * Extracts the first meaningful paragraph or section
   */
  private generateContextSummary(content: string, type: Entry['type']): string {
    // Look for type-specific sections first
    const sectionPatterns: Record<string, RegExp[]> = {
      decision: [/^##?\s*decision\s*\n([\s\S]*?)(?=\n##|\n$|$)/im],
      research: [
        /^##?\s*summary\s*\n([\s\S]*?)(?=\n##|\n$|$)/im,
        /^##?\s*conclusion\s*\n([\s\S]*?)(?=\n##|\n$|$)/im,
      ],
      artifact: [/^##?\s*description\s*\n([\s\S]*?)(?=\n##|\n$|$)/im],
      note: [],
      reference: [/^##?\s*summary\s*\n([\s\S]*?)(?=\n##|\n$|$)/im],
    };

    const patterns = sectionPatterns[type] ?? [];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        return this.truncateSummary(match[1].trim());
      }
    }

    // Fall back to first paragraph
    const firstParagraph = this.extractFirstParagraph(content);
    return this.truncateSummary(firstParagraph);
  }

  private extractFirstParagraph(content: string): string {
    // Skip any frontmatter
    let text = content;
    if (text.startsWith('---')) {
      const endIndex = text.indexOf('---', 3);
      if (endIndex !== -1) {
        text = text.slice(endIndex + 3).trim();
      }
    }

    // Skip headers at the beginning
    const lines = text.split('\n');
    let startIdx = 0;
    while (
      startIdx < lines.length &&
      (lines[startIdx]?.startsWith('#') || lines[startIdx]?.trim() === '')
    ) {
      startIdx++;
    }

    // Find the first paragraph
    const paragraphLines: string[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      if (line.trim() === '') {
        if (paragraphLines.length > 0) break;
        continue;
      }
      if (line.startsWith('#')) break;
      paragraphLines.push(line);
    }

    return paragraphLines.join(' ').trim();
  }

  private truncateSummary(text: string, maxLength: number = 500): string {
    // Clean up the text
    const cleaned = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Truncate at word boundary
    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength - 50) {
      return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
  }
}

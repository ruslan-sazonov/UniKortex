import type { Entry, EntryFilters } from '../types.js';
import type { Storage } from '../storage/interface.js';
import type { EmbeddingService } from '../embedding/service.js';
import type { VectorStore } from '../search/vector-store.js';
import { HybridSearchEngine } from '../search/engine.js';

/**
 * Context item returned to LLM
 */
export interface ContextItem {
  id: string;
  title: string;
  type: Entry['type'];
  content: string;
  tags: string[];
  relevanceScore: number;
  metadata: {
    projectId?: string;
    status: Entry['status'];
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Options for context retrieval
 */
export interface ContextRetrievalOptions {
  query: string;
  maxTokens?: number;
  maxItems?: number;
  filters?: EntryFilters;
  includeRelated?: boolean;
}

/**
 * Result of context retrieval
 */
export interface ContextRetrievalResult {
  items: ContextItem[];
  totalTokensEstimate: number;
  truncated: boolean;
}

/**
 * Retrieves relevant context from the knowledge base for LLM consumption
 * Optimizes for token limits and relevance
 */
export class ContextRetriever {
  private storage: Storage;
  private searchEngine: HybridSearchEngine;

  constructor(storage: Storage, embeddingService?: EmbeddingService, vectorStore?: VectorStore) {
    this.storage = storage;
    this.searchEngine = new HybridSearchEngine(storage, embeddingService, vectorStore);
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieve(options: ContextRetrievalOptions): Promise<ContextRetrievalResult> {
    const { query, maxTokens = 4000, maxItems = 10, filters, includeRelated = false } = options;

    // Search for relevant entries with strict minimum score
    // Context for LLM should only include truly relevant items
    const searchResults = await this.searchEngine.search({
      query,
      mode: 'hybrid',
      filters,
      limit: maxItems * 2, // Fetch extra to account for filtering
      minScore: 0.15, // Higher threshold for context relevance
    });

    const items: ContextItem[] = [];
    let totalTokens = 0;
    const seenIds = new Set<string>();

    for (const result of searchResults) {
      if (items.length >= maxItems) break;
      if (seenIds.has(result.entry.id)) continue;

      const contextItem = this.entryToContextItem(result.entry, result.score);
      const itemTokens = this.estimateTokens(contextItem);

      // Check if we have room for this item
      if (totalTokens + itemTokens > maxTokens) {
        // Try truncating the content
        const truncatedItem = this.truncateItem(contextItem, maxTokens - totalTokens);
        if (truncatedItem) {
          items.push(truncatedItem);
          totalTokens += this.estimateTokens(truncatedItem);
          seenIds.add(result.entry.id);
        }
        break;
      }

      items.push(contextItem);
      totalTokens += itemTokens;
      seenIds.add(result.entry.id);

      // Optionally include related entries
      if (includeRelated && items.length < maxItems && totalTokens < maxTokens * 0.8) {
        const relatedItems = await this.getRelatedItems(result.entry.id, seenIds);
        for (const related of relatedItems) {
          if (items.length >= maxItems) break;

          const relatedTokens = this.estimateTokens(related);
          if (totalTokens + relatedTokens > maxTokens) break;

          items.push(related);
          totalTokens += relatedTokens;
          seenIds.add(related.id);
        }
      }
    }

    return {
      items,
      totalTokensEstimate: totalTokens,
      truncated: searchResults.length > items.length,
    };
  }

  /**
   * Get context for a specific entry by ID
   */
  async getEntryContext(
    entryId: string,
    options?: { includeRelated?: boolean; maxTokens?: number }
  ): Promise<ContextRetrievalResult> {
    const entry = await this.storage.getEntry(entryId);
    if (!entry) {
      return { items: [], totalTokensEstimate: 0, truncated: false };
    }

    const items: ContextItem[] = [this.entryToContextItem(entry, 1.0)];
    let totalTokens = this.estimateTokens(items[0]!);
    const seenIds = new Set([entryId]);

    if (options?.includeRelated) {
      const maxTokens = options?.maxTokens ?? 4000;
      const relatedItems = await this.getRelatedItems(entryId, seenIds);

      for (const related of relatedItems) {
        const relatedTokens = this.estimateTokens(related);
        if (totalTokens + relatedTokens > maxTokens) break;

        items.push(related);
        totalTokens += relatedTokens;
        seenIds.add(related.id);
      }
    }

    return {
      items,
      totalTokensEstimate: totalTokens,
      truncated: false,
    };
  }

  /**
   * Format context items for LLM consumption (markdown format)
   */
  formatForLLM(result: ContextRetrievalResult, format: 'markdown' | 'xml' = 'markdown'): string {
    if (result.items.length === 0) {
      return format === 'xml'
        ? '<knowledge_entries count="0"></knowledge_entries>'
        : 'No relevant context found.';
    }

    if (format === 'xml') {
      return this.formatAsXml(result);
    }

    return this.formatAsMarkdown(result);
  }

  /**
   * Format context as XML for LLM consumption
   */
  private formatAsXml(result: ContextRetrievalResult): string {
    const escapeXml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const entries = result.items.map((item) => {
      const truncatedAttr = item.content.endsWith('...[truncated]') ? ' truncated="true"' : '';

      return `  <entry id="${escapeXml(item.id)}" type="${item.type}" status="${item.metadata.status}">
    <title>${escapeXml(item.title)}</title>
    <relevance>${(item.relevanceScore * 100).toFixed(0)}%</relevance>
    <tags>${escapeXml(item.tags.join(', '))}</tags>
    <created>${item.metadata.createdAt}</created>
    <content${truncatedAttr}>
${escapeXml(item.content)}
    </content>
  </entry>`;
    });

    return `<knowledge_entries count="${result.items.length}">
${entries.join('\n')}
</knowledge_entries>`;
  }

  /**
   * Format context as Markdown for LLM consumption
   */
  private formatAsMarkdown(result: ContextRetrievalResult): string {
    const sections: string[] = [];

    for (const item of result.items) {
      const header = `## ${item.title} [${item.type}]`;
      const meta = [
        `ID: ${item.id}`,
        `Relevance: ${(item.relevanceScore * 100).toFixed(0)}%`,
        item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      sections.push(`${header}\n${meta}\n\n${item.content}`);
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Convert an entry to a context item
   */
  private entryToContextItem(entry: Entry, score: number): ContextItem {
    return {
      id: entry.id,
      title: entry.title,
      type: entry.type,
      content: entry.content,
      tags: entry.tags,
      relevanceScore: score,
      metadata: {
        projectId: entry.projectId,
        status: entry.status,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Get related items for an entry
   */
  private async getRelatedItems(entryId: string, seenIds: Set<string>): Promise<ContextItem[]> {
    const relations = await this.storage.getEntryRelations(entryId);
    const items: ContextItem[] = [];

    for (const relation of relations) {
      const relatedId = relation.fromId === entryId ? relation.toId : relation.fromId;

      if (seenIds.has(relatedId)) continue;

      const entry = await this.storage.getEntry(relatedId);
      if (entry) {
        // Lower score for related items
        items.push(this.entryToContextItem(entry, 0.5));
      }
    }

    return items;
  }

  /**
   * Estimate token count for a context item
   * Uses rough approximation: ~4 characters per token
   */
  private estimateTokens(item: ContextItem): number {
    const text = [item.title, item.type, item.content, item.tags.join(' ')].join(' ');

    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate a context item to fit within token budget
   */
  private truncateItem(item: ContextItem, maxTokens: number): ContextItem | null {
    const headerTokens = this.estimateTokens({
      ...item,
      content: '',
    });

    if (headerTokens >= maxTokens) {
      return null;
    }

    const contentBudget = (maxTokens - headerTokens) * 4; // Convert back to characters
    if (contentBudget < 100) {
      return null;
    }

    return {
      ...item,
      content: item.content.slice(0, contentBudget) + '...[truncated]',
    };
  }
}

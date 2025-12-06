import type { Entry, EntryFilters } from '../types.js';
import type { Storage } from '../storage/interface.js';
import type { EmbeddingService } from '../embedding/service.js';
import { prepareTextForEmbedding } from '../embedding/service.js';
import type { VectorStore } from './vector-store.js';

/**
 * Search mode
 */
export type SearchMode = 'hybrid' | 'semantic' | 'keyword';

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  mode?: SearchMode;
  filters?: EntryFilters;
  limit?: number;
  /** Minimum similarity score (0-1) to include in results. Default: 0.1 for semantic, 0 for keyword */
  minScore?: number;
}

/**
 * Search result with scores
 */
export interface SearchResult {
  entry: Entry;
  score: number;
  scoreBreakdown: {
    semantic: number;
    keyword: number;
  };
}

/**
 * Hybrid search engine combining semantic and keyword search
 * Uses Reciprocal Rank Fusion (RRF) to combine results
 */
export class HybridSearchEngine {
  private storage: Storage;
  private embeddingService: EmbeddingService | null;
  private vectorStore: VectorStore | null;

  constructor(storage: Storage, embeddingService?: EmbeddingService, vectorStore?: VectorStore) {
    this.storage = storage;
    this.embeddingService = embeddingService ?? null;
    this.vectorStore = vectorStore ?? null;
  }

  /**
   * Check if semantic search is available
   */
  isSemanticAvailable(): boolean {
    return this.embeddingService !== null && this.vectorStore !== null;
  }

  /**
   * Search entries
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, mode = 'hybrid', filters, limit = 10, minScore } = options;

    // Determine effective search mode based on availability
    let effectiveMode = mode;
    if (mode === 'semantic' && !this.isSemanticAvailable()) {
      console.warn('Semantic search not available, falling back to keyword search');
      effectiveMode = 'keyword';
    }
    if (mode === 'hybrid' && !this.isSemanticAvailable()) {
      effectiveMode = 'keyword';
    }

    // Default minimum scores based on mode
    // all-MiniLM-L6-v2 similarity scores are typically 0.1-0.6 for relevant content
    // - semantic mode: higher threshold (0.3) to show only truly relevant
    // - hybrid mode: lower threshold (0.05) to include partial matches combined with keyword
    const defaultMinScore =
      effectiveMode === 'keyword' ? 0 : effectiveMode === 'semantic' ? 0.3 : 0.05;
    const threshold = minScore ?? defaultMinScore;

    let results: SearchResult[];
    switch (effectiveMode) {
      case 'keyword':
        results = await this.keywordSearch(query, filters, limit);
        break;

      case 'semantic':
        results = await this.semanticSearch(query, filters, limit);
        break;

      case 'hybrid':
      default:
        results = await this.hybridSearch(query, filters, limit);
        break;
    }

    // Filter by minimum score for semantic/hybrid modes
    if (effectiveMode !== 'keyword' && threshold > 0) {
      results = results.filter((r) => r.scoreBreakdown.semantic >= threshold);
    }

    return results;
  }

  /**
   * Keyword-only search using FTS5
   */
  private async keywordSearch(
    query: string,
    filters?: EntryFilters,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const results = await this.storage.searchEntries(query, {
      ...filters,
      limit,
    });

    // Normalize FTS5 scores (they're negative, lower is better)
    const maxScore = Math.max(...results.items.map((_, i) => results.items.length - i));

    return results.items.map((entry, index) => ({
      entry,
      score: (results.items.length - index) / maxScore,
      scoreBreakdown: {
        semantic: 0,
        keyword: (results.items.length - index) / maxScore,
      },
    }));
  }

  /**
   * Semantic-only search using vector similarity
   */
  private async semanticSearch(
    query: string,
    filters?: EntryFilters,
    limit: number = 10
  ): Promise<SearchResult[]> {
    if (!this.embeddingService || !this.vectorStore) {
      return [];
    }

    // Embed the query
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search for similar vectors
    const vectorResults = await this.vectorStore.search(queryEmbedding, limit * 2);

    // Fetch full entries and apply filters
    const results: SearchResult[] = [];

    for (const vectorResult of vectorResults) {
      const entry = await this.storage.getEntry(vectorResult.entryId);
      if (!entry) continue;

      // Apply filters
      if (filters?.projectId && entry.projectId !== filters.projectId) continue;
      if (filters?.type && !filters.type.includes(entry.type)) continue;
      if (filters?.status && !filters.status.includes(entry.status)) continue;

      results.push({
        entry,
        score: vectorResult.similarity,
        scoreBreakdown: {
          semantic: vectorResult.similarity,
          keyword: 0,
        },
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Hybrid search combining semantic and keyword results
   * Uses Reciprocal Rank Fusion (RRF)
   */
  private async hybridSearch(
    query: string,
    filters?: EntryFilters,
    limit: number = 10
  ): Promise<SearchResult[]> {
    // Fetch more results than needed for better fusion
    const fetchLimit = limit * 2;

    // Run both searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, filters, fetchLimit),
      this.keywordSearch(query, filters, fetchLimit),
    ]);

    // Apply Reciprocal Rank Fusion
    const k = 60; // RRF constant
    const scores = new Map<
      string,
      {
        entry: Entry;
        score: number;
        breakdown: { semantic: number; keyword: number };
      }
    >();

    // Add semantic results with RRF scores
    semanticResults.forEach((result, rank) => {
      const rrf = 1 / (k + rank + 1);
      scores.set(result.entry.id, {
        entry: result.entry,
        score: rrf,
        breakdown: { semantic: result.score, keyword: 0 },
      });
    });

    // Add/merge keyword results with RRF scores
    keywordResults.forEach((result, rank) => {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(result.entry.id);

      if (existing) {
        existing.score += rrf;
        existing.breakdown.keyword = result.score;
      } else {
        scores.set(result.entry.id, {
          entry: result.entry,
          score: rrf,
          breakdown: { semantic: 0, keyword: result.score },
        });
      }
    });

    // Sort by combined score and return top results
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({
        entry: s.entry,
        score: s.score,
        scoreBreakdown: s.breakdown,
      }));
  }

  /**
   * Index an entry for search
   * Creates embedding and stores in vector store
   */
  async indexEntry(entry: Entry): Promise<void> {
    if (!this.embeddingService || !this.vectorStore) {
      return;
    }

    const text = prepareTextForEmbedding(
      entry.title,
      entry.content,
      entry.tags,
      entry.contextSummary
    );

    const embedding = await this.embeddingService.embed(text);
    await this.vectorStore.upsert(entry.id, embedding);
  }

  /**
   * Remove an entry from the search index
   */
  async removeEntry(entryId: string): Promise<void> {
    if (!this.vectorStore) return;
    await this.vectorStore.delete(entryId);
  }

  /**
   * Reindex all entries
   */
  async reindexAll(onProgress?: (current: number, total: number) => void): Promise<number> {
    if (!this.embeddingService || !this.vectorStore) {
      return 0;
    }

    const entries = await this.storage.listEntries({ limit: 10000 });
    let indexed = 0;

    for (const entry of entries.items) {
      await this.indexEntry(entry);
      indexed++;
      onProgress?.(indexed, entries.total);
    }

    return indexed;
  }
}

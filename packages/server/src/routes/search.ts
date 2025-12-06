import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PostgresStorage } from '../db/postgres.js';
import {
  HybridSearchEngine,
  ContextRetriever,
  EmbeddingService,
  type EntryFilters,
} from '@unikortex/core';
import type { ServerConfig } from '../config.js';

const searchQuerySchema = z.object({
  q: z.string().min(1),
  project: z.string().optional(),
  type: z.string().optional(), // comma-separated
  status: z.string().optional(), // comma-separated
  mode: z.enum(['keyword', 'semantic', 'hybrid']).optional().default('hybrid'),
  limit: z.coerce.number().optional().default(10),
  minScore: z.coerce.number().optional(),
});

const contextQuerySchema = z.object({
  q: z.string().min(1),
  project: z.string().optional(),
  maxTokens: z.coerce.number().optional().default(4000),
  maxItems: z.coerce.number().optional().default(10),
  format: z.enum(['xml', 'markdown', 'json']).optional().default('xml'),
});

export function createSearchRoutes(
  storage: PostgresStorage,
  config: ServerConfig
): FastifyPluginAsync {
  return async function (fastify) {
    // Initialize search engine (with optional embeddings)
    let embeddingService: EmbeddingService | undefined;
    let searchEngine: HybridSearchEngine;
    let contextRetriever: ContextRetriever;

    try {
      embeddingService = new EmbeddingService(config.embeddings);
      await embeddingService.initialize();

      // Note: For PostgreSQL + pgvector, we'd use a different vector store
      // For now, search engine will work in keyword-only mode if pgvector not available
      searchEngine = new HybridSearchEngine(storage, embeddingService);
      contextRetriever = new ContextRetriever(storage, embeddingService);

      fastify.log.info(`Initialized embeddings with ${embeddingService.providerName}`);
    } catch {
      fastify.log.warn('Embeddings not available, using keyword-only search');
      searchEngine = new HybridSearchEngine(storage);
      contextRetriever = new ContextRetriever(storage);
    }

    // Search endpoint
    fastify.get<{ Querystring: z.infer<typeof searchQuerySchema> }>('/search', async (request) => {
      const parsed = searchQuerySchema.parse(request.query);

      let projectId: string | undefined;
      if (parsed.project) {
        const project = await storage.getProjectByName(parsed.project);
        if (project) {
          projectId = project.id;
        }
      }

      const filters: EntryFilters = {
        projectId,
        type: parsed.type?.split(',') as EntryFilters['type'],
        status: parsed.status?.split(',') as EntryFilters['status'],
      };

      const results = await searchEngine.search({
        query: parsed.q,
        mode: parsed.mode,
        filters,
        limit: parsed.limit,
        minScore: parsed.minScore,
      });

      // Enrich with project names
      const enrichedResults = await Promise.all(
        results.map(async (r) => {
          const project = await storage.getProject(r.entry.projectId);
          return {
            ...r,
            entry: {
              ...r.entry,
              projectName: project?.name ?? 'unknown',
            },
          };
        })
      );

      return {
        results: enrichedResults,
        total: results.length,
        query: parsed.q,
        mode: parsed.mode,
      };
    });

    // Context endpoint - for LLM consumption
    fastify.get<{ Querystring: z.infer<typeof contextQuerySchema> }>(
      '/context',
      async (request) => {
        const parsed = contextQuerySchema.parse(request.query);

        let projectId: string | undefined;
        if (parsed.project) {
          const project = await storage.getProjectByName(parsed.project);
          if (project) {
            projectId = project.id;
          }
        }

        const result = await contextRetriever.retrieve({
          query: parsed.q,
          maxTokens: parsed.maxTokens,
          maxItems: parsed.maxItems,
          filters: { projectId },
        });

        if (parsed.format === 'json') {
          return result;
        }

        const formatted = contextRetriever.formatForLLM(
          result,
          parsed.format as 'xml' | 'markdown'
        );

        return {
          content: formatted,
          itemCount: result.items.length,
          tokensEstimate: result.totalTokensEstimate,
          truncated: result.truncated,
        };
      }
    );

    // POST endpoint for context (for complex queries)
    fastify.post<{
      Body: {
        query: string;
        project?: string;
        maxTokens?: number;
        maxItems?: number;
        format?: 'xml' | 'markdown' | 'json';
        filters?: {
          type?: string[];
          status?: string[];
          tags?: string[];
        };
      };
    }>('/context', async (request) => {
      const {
        query,
        project,
        maxTokens = 4000,
        maxItems = 10,
        format = 'xml',
        filters,
      } = request.body;

      let projectId: string | undefined;
      if (project) {
        const proj = await storage.getProjectByName(project);
        if (proj) {
          projectId = proj.id;
        }
      }

      const result = await contextRetriever.retrieve({
        query,
        maxTokens,
        maxItems,
        filters: {
          projectId,
          type: filters?.type as EntryFilters['type'],
          status: filters?.status as EntryFilters['status'],
          tags: filters?.tags,
        },
      });

      if (format === 'json') {
        return result;
      }

      const formatted = contextRetriever.formatForLLM(result, format);

      return {
        content: formatted,
        itemCount: result.items.length,
        tokensEstimate: result.totalTokensEstimate,
        truncated: result.truncated,
      };
    });
  };
}

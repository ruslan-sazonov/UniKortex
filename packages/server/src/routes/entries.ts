import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PostgresStorage } from '../db/postgres.js';
import type { EntryFilters } from '@unikortex/core';

const entryTypeSchema = z.enum(['decision', 'research', 'artifact', 'note', 'reference']);
const entryStatusSchema = z.enum(['draft', 'active', 'superseded', 'archived']);

const createEntrySchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  type: entryTypeSchema,
  status: entryStatusSchema.optional().default('active'),
  content: z.string(),
  tags: z.array(z.string()).optional().default([]),
  contextSummary: z.string().optional(),
  supersedes: z.string().optional(),
});

const updateEntrySchema = z.object({
  title: z.string().min(1).optional(),
  type: entryTypeSchema.optional(),
  status: entryStatusSchema.optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  contextSummary: z.string().optional(),
  supersedes: z.string().optional(),
});

const listEntriesQuerySchema = z.object({
  projectId: z.string().optional(),
  type: z.string().optional(), // comma-separated
  status: z.string().optional(), // comma-separated
  tags: z.string().optional(), // comma-separated
  limit: z.coerce.number().optional().default(50),
  offset: z.coerce.number().optional().default(0),
});

export function createEntryRoutes(storage: PostgresStorage): FastifyPluginAsync {
  return async function (fastify) {
    // List entries
    fastify.get<{ Querystring: z.infer<typeof listEntriesQuerySchema> }>('/', async (request) => {
      const parsed = listEntriesQuerySchema.parse(request.query);

      const filters: EntryFilters = {
        projectId: parsed.projectId,
        type: parsed.type?.split(',') as EntryFilters['type'],
        status: parsed.status?.split(',') as EntryFilters['status'],
        tags: parsed.tags?.split(','),
        limit: parsed.limit,
        offset: parsed.offset,
      };

      const result = await storage.listEntries(filters);
      return result;
    });

    // Get entry by ID
    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const entry = await storage.getEntry(request.params.id);
      if (!entry) {
        return reply.notFound('Entry not found');
      }
      return entry;
    });

    // Create entry
    fastify.post<{ Body: z.infer<typeof createEntrySchema> }>('/', async (request, reply) => {
      const parsed = createEntrySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      // Verify project exists
      const project = await storage.getProject(parsed.data.projectId);
      if (!project) {
        return reply.badRequest('Project not found');
      }

      const entry = await storage.createEntry(parsed.data);
      return reply.code(201).send(entry);
    });

    // Update entry
    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateEntrySchema> }>(
      '/:id',
      async (request, reply) => {
        const parsed = updateEntrySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.badRequest(parsed.error.message);
        }

        const entry = await storage.updateEntry(request.params.id, parsed.data);
        if (!entry) {
          return reply.notFound('Entry not found');
        }
        return entry;
      }
    );

    // Delete entry
    fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const deleted = await storage.deleteEntry(request.params.id);
      if (!deleted) {
        return reply.notFound('Entry not found');
      }
      return reply.code(204).send();
    });

    // Get entry relations
    fastify.get<{ Params: { id: string } }>('/:id/relations', async (request, reply) => {
      const entry = await storage.getEntry(request.params.id);
      if (!entry) {
        return reply.notFound('Entry not found');
      }

      const relations = await storage.getEntryRelations(request.params.id);
      const relatedEntries = await storage.getRelatedEntries(request.params.id);

      return {
        relations,
        relatedEntries,
      };
    });

    // Add relation
    fastify.post<{
      Params: { id: string };
      Body: { toId: string; relationType?: string };
    }>('/:id/relations', async (request, reply) => {
      const { id: fromId } = request.params;
      const { toId, relationType = 'related' } = request.body;

      // Verify both entries exist
      const [fromEntry, toEntry] = await Promise.all([
        storage.getEntry(fromId),
        storage.getEntry(toId),
      ]);

      if (!fromEntry) {
        return reply.notFound('Source entry not found');
      }
      if (!toEntry) {
        return reply.badRequest('Target entry not found');
      }

      const relation = await storage.createRelation({
        fromId,
        toId,
        relationType: relationType as 'related' | 'implements' | 'extends' | 'contradicts',
      });

      return reply.code(201).send(relation);
    });

    // Delete relation
    fastify.delete<{
      Params: { id: string; toId: string };
    }>('/:id/relations/:toId', async (request, reply) => {
      const { id: fromId, toId } = request.params;

      const deleted = await storage.deleteRelation(fromId, toId);
      if (!deleted) {
        return reply.notFound('Relation not found');
      }
      return reply.code(204).send();
    });
  };
}

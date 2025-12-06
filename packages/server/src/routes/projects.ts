import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PostgresStorage } from '../db/postgres.js';

const createProjectSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
  displayName: z.string().min(1),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
});

export function createProjectRoutes(storage: PostgresStorage): FastifyPluginAsync {
  return async function (fastify) {
    // List projects
    fastify.get('/', async () => {
      const projects = await storage.listProjects();
      return { projects };
    });

    // Get project by ID
    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const project = await storage.getProject(request.params.id);
      if (!project) {
        return reply.notFound('Project not found');
      }
      return project;
    });

    // Create project
    fastify.post<{ Body: z.infer<typeof createProjectSchema> }>('/', async (request, reply) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.message);
      }

      // Check if project name already exists
      const existing = await storage.getProjectByName(parsed.data.name);
      if (existing) {
        return reply.conflict('Project with this name already exists');
      }

      const project = await storage.createProject(parsed.data);
      return reply.code(201).send(project);
    });

    // Update project
    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof updateProjectSchema> }>(
      '/:id',
      async (request, reply) => {
        const parsed = updateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.badRequest(parsed.error.message);
        }

        const project = await storage.updateProject(request.params.id, parsed.data);
        if (!project) {
          return reply.notFound('Project not found');
        }
        return project;
      }
    );

    // Delete project
    fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const deleted = await storage.deleteProject(request.params.id);
      if (!deleted) {
        return reply.notFound('Project not found');
      }
      return reply.code(204).send();
    });
  };
}

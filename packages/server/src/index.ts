import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

import { loadServerConfig } from './config.js';
import { PostgresStorage } from './db/postgres.js';
import { createApiKeyAuth } from './auth/api-key.js';
import { createProjectRoutes } from './routes/projects.js';
import { createEntryRoutes } from './routes/entries.js';
import { createSearchRoutes } from './routes/search.js';
import { createUserRoutes } from './routes/users.js';

async function main() {
  const config = loadServerConfig();

  // Initialize Fastify
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // Register plugins
  await fastify.register(sensible);

  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // Initialize storage
  const storage = new PostgresStorage({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await storage.initialize();
    fastify.log.info('Database initialized');
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to initialize database');
    process.exit(1);
  }

  // Create auth middleware
  const authenticate = createApiKeyAuth(storage);

  // Health check (no auth required)
  fastify.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // API info (no auth required)
  fastify.get('/', async () => {
    return {
      name: 'UniKortex API',
      version: '0.1.0',
      endpoints: {
        health: 'GET /health',
        projects: 'GET|POST /api/v1/projects',
        entries: 'GET|POST /api/v1/entries',
        search: 'GET /api/v1/search',
        context: 'GET|POST /api/v1/context',
      },
    };
  });

  // User routes (some public, some authenticated)
  await fastify.register(
    async (users) => {
      // Register route - public
      await users.register(createUserRoutes(storage));
    },
    { prefix: '/api/v1/users' }
  );

  // Protected API routes (require auth)
  await fastify.register(
    async (api) => {
      // Apply auth to all routes in this scope
      api.addHook('preHandler', authenticate);

      // Register route handlers
      await api.register(createProjectRoutes(storage), { prefix: '/projects' });
      await api.register(createEntryRoutes(storage), { prefix: '/entries' });
      await api.register(createSearchRoutes(storage, config));
    },
    { prefix: '/api/v1' }
  );

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down...');
    await fastify.close();
    await storage.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start server
  try {
    await fastify.listen({
      host: config.host,
      port: config.port,
    });
    fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

main();

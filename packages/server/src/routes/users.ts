import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import type { PostgresStorage } from '../db/postgres.js';
import { generateApiKey, hashApiKey, type AuthContext } from '../auth/api-key.js';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8).optional(), // Optional for API-only access
});

const createApiKeySchema = z.object({
  name: z.string().min(1),
  expiresInDays: z.number().optional(),
});

/**
 * Hash a password using SHA-256 with salt
 * Note: In production, use bcrypt or argon2
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against its hash
 */
function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const computedHash = createHash('sha256').update(salt + password).digest('hex');
  return hash === computedHash;
}

export function createUserRoutes(storage: PostgresStorage): FastifyPluginAsync {
  return async function (fastify) {
    // Register new user (public endpoint)
    fastify.post<{ Body: z.infer<typeof registerSchema> }>(
      '/register',
      { config: { skipAuth: true } },
      async (request, reply) => {
        const parsed = registerSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.badRequest(parsed.error.message);
        }

        // Check if email already exists
        const existing = await storage.getUserByEmail(parsed.data.email);
        if (existing) {
          return reply.conflict('Email already registered');
        }

        const passwordHash = parsed.data.password
          ? hashPassword(parsed.data.password)
          : undefined;

        const user = await storage.createUser(
          parsed.data.email,
          parsed.data.name,
          passwordHash
        );

        // Generate initial API key
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        await storage.createApiKey(user.id, keyHash, 'Default API Key');

        return reply.code(201).send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          apiKey: apiKey, // Only shown once!
          message: 'Save your API key securely. It will not be shown again.',
        });
      }
    );

    // Get current user (requires auth)
    fastify.get('/me', async (request) => {
      const auth = (request as unknown as { auth: AuthContext }).auth;
      const user = await storage.getUserById(auth.userId);
      return user;
    });

    // Create new API key (requires auth)
    fastify.post<{ Body: z.infer<typeof createApiKeySchema> }>(
      '/me/api-keys',
      async (request, reply) => {
        const auth = (request as unknown as { auth: AuthContext }).auth;
        const parsed = createApiKeySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.badRequest(parsed.error.message);
        }

        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);

        let expiresAt: Date | undefined;
        if (parsed.data.expiresInDays) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + parsed.data.expiresInDays);
        }

        const { id } = await storage.createApiKey(
          auth.userId,
          keyHash,
          parsed.data.name,
          expiresAt
        );

        return reply.code(201).send({
          id,
          name: parsed.data.name,
          apiKey, // Only shown once!
          expiresAt: expiresAt?.toISOString(),
          message: 'Save your API key securely. It will not be shown again.',
        });
      }
    );
  };
}

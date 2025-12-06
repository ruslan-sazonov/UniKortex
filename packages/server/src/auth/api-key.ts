import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PostgresStorage } from '../db/postgres.js';

/**
 * Generate a new API key with prefix
 * Format: uk_<random32chars>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString('base64url');
  return `uk_${randomPart}`;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract API key from request headers
 * Supports: Authorization: Bearer <key>
 *          X-API-Key: <key>
 */
export function extractApiKey(request: FastifyRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * API key authentication context
 */
export interface AuthContext {
  userId: string;
  apiKeyId: string;
}

/**
 * Create API key authentication middleware
 */
export function createApiKeyAuth(storage: PostgresStorage) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = extractApiKey(request);

    if (!key) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing API key. Provide via Authorization: Bearer <key> or X-API-Key header.',
      });
      return;
    }

    // Validate key format
    if (!key.startsWith('uk_')) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key format.',
      });
      return;
    }

    const keyHash = hashApiKey(key);
    const apiKey = await storage.getApiKeyByHash(keyHash);

    if (!apiKey) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key.',
      });
      return;
    }

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'API key has expired.',
      });
      return;
    }

    // Update last used timestamp (async, don't wait)
    storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});

    // Attach auth context to request
    (request as FastifyRequest & { auth: AuthContext }).auth = {
      userId: apiKey.userId,
      apiKeyId: apiKey.id,
    };
  };
}

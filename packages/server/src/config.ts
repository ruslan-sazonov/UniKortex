import { z } from 'zod';

/**
 * Server configuration schema
 */
export const serverConfigSchema = z.object({
  // Server settings
  host: z.string().default('0.0.0.0'),
  port: z.number().default(3033),

  // Database - PostgreSQL for team mode
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    name: z.string().default('unikortex'),
    user: z.string().default('unikortex'),
    password: z.string().optional(),
    ssl: z.boolean().default(false),
  }).default({}),

  // Embeddings configuration
  embeddings: z.object({
    provider: z.enum(['auto', 'local', 'ollama', 'openai']).default('auto'),
    openai: z.object({
      model: z.string().default('text-embedding-3-small'),
      dimensions: z.number().default(512),
    }).optional(),
    ollama: z.object({
      host: z.string().default('http://localhost:11434'),
      model: z.string().default('nomic-embed-text'),
    }).optional(),
  }).default({}),

  // Rate limiting
  rateLimit: z.object({
    max: z.number().default(100),
    timeWindow: z.string().default('1 minute'),
  }).default({}),

  // CORS
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default(true),
    credentials: z.boolean().default(true),
  }).default({}),

  // JWT settings for auth
  jwt: z.object({
    secret: z.string().optional(),
    expiresIn: z.string().default('7d'),
  }).default({}),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/**
 * Load server configuration from environment variables
 */
export function loadServerConfig(): ServerConfig {
  const config = serverConfigSchema.parse({
    host: process.env.HOST,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
    },
    embeddings: {
      provider: process.env.EMBEDDINGS_PROVIDER as 'auto' | 'local' | 'ollama' | 'openai' | undefined,
      openai: process.env.OPENAI_API_KEY ? {
        model: process.env.OPENAI_EMBEDDING_MODEL,
        dimensions: process.env.OPENAI_EMBEDDING_DIMENSIONS
          ? parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS, 10)
          : undefined,
      } : undefined,
      ollama: process.env.OLLAMA_HOST ? {
        host: process.env.OLLAMA_HOST,
        model: process.env.OLLAMA_EMBEDDING_MODEL,
      } : undefined,
    },
    rateLimit: {
      max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
      timeWindow: process.env.RATE_LIMIT_WINDOW,
    },
    cors: {
      origin: process.env.CORS_ORIGIN,
      credentials: process.env.CORS_CREDENTIALS === 'true',
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN,
    },
  });

  return config;
}

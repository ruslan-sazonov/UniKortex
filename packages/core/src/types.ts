import { z } from 'zod';

// === ID Types ===
export type EntryId = string; // Format: "unikortex_" + nanoid(12)
export type ProjectId = string;
export type UserId = string;
export type WorkspaceId = string;
export type OrganizationId = string;

// === Enums ===
export const EntryType = z.enum(['decision', 'research', 'artifact', 'note', 'reference']);
export type EntryType = z.infer<typeof EntryType>;

export const EntryStatus = z.enum(['draft', 'active', 'superseded', 'archived']);
export type EntryStatus = z.infer<typeof EntryStatus>;

export const RelationType = z.enum(['related', 'implements', 'extends', 'contradicts']);
export type RelationType = z.infer<typeof RelationType>;

// === Core Schemas ===

export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(), // Only used in team mode
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Project name must be lowercase alphanumeric with hyphens',
    }),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const EntrySchema = z.object({
  id: z.string().regex(/^unikortex_[a-zA-Z0-9]{12}$/, {
    message: 'Entry ID must be in format unikortex_xxxxxxxxxxxx',
  }),
  projectId: z.string(),
  authorId: z.string().optional(), // Only used in team mode

  // Content
  title: z.string().min(1).max(500),
  type: EntryType,
  status: EntryStatus,
  content: z.string().min(1),
  contextSummary: z.string().max(500).optional(),

  // Metadata
  tags: z.array(z.string().min(1).max(50)).default([]),
  supersedes: z.string().nullable().optional(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),

  // Sync (internal)
  version: z.number().int().positive().default(1),
  checksum: z.string().optional(),
});

export type Entry = z.infer<typeof EntrySchema>;

export const EntryRelationSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  relationType: RelationType,
});

export type EntryRelation = z.infer<typeof EntryRelationSchema>;

// === Input Schemas (for creation/updates) ===

export const CreateProjectInput = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Project name must be lowercase alphanumeric with hyphens',
    }),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

export const CreateEntryInput = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(500),
  type: EntryType,
  status: EntryStatus.default('active'),
  content: z.string().min(1),
  contextSummary: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(50)).default([]),
  supersedes: z.string().nullable().optional(),
});

export type CreateEntryInput = z.infer<typeof CreateEntryInput>;

export const UpdateEntryInput = z.object({
  title: z.string().min(1).max(500).optional(),
  type: EntryType.optional(),
  status: EntryStatus.optional(),
  content: z.string().min(1).optional(),
  contextSummary: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
  supersedes: z.string().nullable().optional(),
});

export type UpdateEntryInput = z.infer<typeof UpdateEntryInput>;

export const CreateRelationInput = z.object({
  fromId: z.string(),
  toId: z.string(),
  relationType: RelationType.default('related'),
});

export type CreateRelationInput = z.infer<typeof CreateRelationInput>;

// === Upsert Schemas (for sync - preserve IDs from remote) ===

export const UpsertProjectInput = z.object({
  id: z.string(),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Project name must be lowercase alphanumeric with hyphens',
    }),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UpsertProjectInput = z.infer<typeof UpsertProjectInput>;

export const UpsertEntryInput = z.object({
  id: z.string().regex(/^unikortex_[a-zA-Z0-9]{12}$/, {
    message: 'Entry ID must be in format unikortex_xxxxxxxxxxxx',
  }),
  projectId: z.string(),
  title: z.string().min(1).max(500),
  type: EntryType,
  status: EntryStatus.default('active'),
  content: z.string().min(1),
  contextSummary: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(50)).default([]),
  supersedes: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().positive().default(1),
});

export type UpsertEntryInput = z.infer<typeof UpsertEntryInput>;

// === Query/Filter Types ===

export const EntryFiltersSchema = z.object({
  projectId: z.string().optional(),
  type: z.array(EntryType).optional(),
  status: z.array(EntryStatus).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(), // FTS search query
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type EntryFilters = z.input<typeof EntryFiltersSchema>;

// === Config Types ===

export const UniKortexMode = z.enum(['personal', 'team']);
export type UniKortexMode = z.infer<typeof UniKortexMode>;

export const EmbeddingProvider = z.enum(['auto', 'local', 'ollama', 'openai']);
export type EmbeddingProvider = z.infer<typeof EmbeddingProvider>;

export const ConfigSchema = z.object({
  mode: UniKortexMode.default('personal'),

  server: z
    .object({
      url: z.string().url().optional(),
    })
    .optional(),

  embeddings: z
    .object({
      provider: EmbeddingProvider.default('auto'),
      local: z
        .object({
          model: z.string().default('Xenova/all-MiniLM-L6-v2'),
        })
        .optional(),
      ollama: z
        .object({
          host: z.string().default('http://localhost:11434'),
          model: z.string().default('nomic-embed-text'),
        })
        .optional(),
      openai: z
        .object({
          model: z.string().default('text-embedding-3-small'),
          dimensions: z.number().int().positive().default(512),
        })
        .optional(),
    })
    .optional(),

  vault: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().optional(), // Defaults to ~/.unikortex/vault
      syncOnChange: z.boolean().default(true),
    })
    .optional(),

  // Remote sync configuration (Turso)
  sync: z
    .object({
      enabled: z.boolean().default(false),
      url: z.string(), // Turso database URL (libsql://<db>-<org>.turso.io)
      authToken: z.string().optional(), // Turso auth token (optional for local libsql)
      autoSync: z.boolean().default(true), // Auto-push on write, auto-pull before read
      syncInterval: z.number().int().nonnegative().default(0), // Interval in ms for background sync (0 = disabled)
    })
    .optional(),

  output: z
    .object({
      defaultFormat: z.enum(['table', 'json', 'minimal']).default('table'),
      colors: z.boolean().default(true),
    })
    .optional(),

  // Active project for filtering searches/context
  activeProject: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// === Result Types ===

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface EntryWithRelations extends Entry {
  relations: EntryRelation[];
  project?: Project;
}

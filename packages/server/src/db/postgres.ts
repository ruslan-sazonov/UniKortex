import { Pool, type PoolConfig } from 'pg';
import type {
  Storage,
  Entry,
  Project,
  EntryRelation,
  CreateEntryInput,
  UpdateEntryInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateRelationInput,
  EntryFilters,
  PaginatedResult,
} from '@unikortex/core';
import { generateId } from '@unikortex/core';

/**
 * PostgreSQL storage implementation for team mode
 * Uses pgvector for embeddings (optional)
 */
export class PostgresStorage implements Storage {
  private pool: Pool;
  private initialized = false;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create tables if they don't exist
    await this.pool.query(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Entries table
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('decision', 'research', 'artifact', 'note', 'reference')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'superseded', 'archived')),
        content TEXT NOT NULL,
        context_summary TEXT,
        supersedes TEXT REFERENCES entries(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        version INTEGER DEFAULT 1,
        checksum TEXT
      );

      -- Entry tags
      CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (entry_id, tag)
      );

      -- Entry relations
      CREATE TABLE IF NOT EXISTS entry_relations (
        from_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL DEFAULT 'related'
          CHECK(relation_type IN ('related', 'implements', 'extends', 'contradicts')),
        PRIMARY KEY (from_id, to_id)
      );

      -- Users table (for team mode)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- API keys
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        last_used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
      CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at);
      CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

      -- Full-text search index
      CREATE INDEX IF NOT EXISTS idx_entries_fts ON entries
        USING GIN (to_tsvector('english', title || ' ' || content || ' ' || COALESCE(context_summary, '')));
    `);

    // Try to enable pgvector extension (optional)
    try {
      await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);

      // Create embeddings table if pgvector is available
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS entry_embeddings (
          entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
          embedding vector(384),
          model TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_entry_embeddings_vector ON entry_embeddings
          USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      `);
    } catch {
      // pgvector not available, semantic search will use keyword-only
      console.warn('pgvector extension not available. Semantic search will use keyword-only mode.');
    }

    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.initialized = false;
  }

  // === Projects ===

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = generateId();
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO projects (id, name, display_name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [id, input.name, input.displayName, input.description ?? null, now]
    );

    return this.rowToProject(result.rows[0]);
  }

  async getProject(id: string): Promise<Project | null> {
    const result = await this.pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToProject(result.rows[0]) : null;
  }

  async getProjectByName(name: string): Promise<Project | null> {
    const result = await this.pool.query('SELECT * FROM projects WHERE name = $1', [name]);
    return result.rows[0] ? this.rowToProject(result.rows[0]) : null;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project | null> {
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.displayName !== undefined) {
      sets.push(`display_name = $${paramIndex++}`);
      values.push(input.displayName);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0] ? this.rowToProject(result.rows[0]) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM projects WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listProjects(): Promise<Project[]> {
    const result = await this.pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    return result.rows.map((row) => this.rowToProject(row));
  }

  // === Entries ===

  async createEntry(input: CreateEntryInput): Promise<Entry> {
    const id = generateId();
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO entries (id, project_id, title, type, status, content, context_summary, supersedes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        id,
        input.projectId,
        input.title,
        input.type,
        input.status ?? 'active',
        input.content,
        input.contextSummary ?? null,
        input.supersedes ?? null,
        now,
      ]
    );

    // Add tags
    if (input.tags && input.tags.length > 0) {
      await this.setEntryTags(id, input.tags);
    }

    const entry = this.rowToEntry(result.rows[0]);
    entry.tags = input.tags ?? [];
    return entry;
  }

  async getEntry(id: string): Promise<Entry | null> {
    const result = await this.pool.query('SELECT * FROM entries WHERE id = $1', [id]);

    if (!result.rows[0]) return null;

    const entry = this.rowToEntry(result.rows[0]);
    entry.tags = await this.getEntryTags(id);
    return entry;
  }

  async updateEntry(id: string, input: UpdateEntryInput): Promise<Entry | null> {
    const sets: string[] = ['updated_at = NOW()', 'version = version + 1'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      sets.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.type !== undefined) {
      sets.push(`type = $${paramIndex++}`);
      values.push(input.type);
    }
    if (input.status !== undefined) {
      sets.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.content !== undefined) {
      sets.push(`content = $${paramIndex++}`);
      values.push(input.content);
    }
    if (input.contextSummary !== undefined) {
      sets.push(`context_summary = $${paramIndex++}`);
      values.push(input.contextSummary);
    }
    if (input.supersedes !== undefined) {
      sets.push(`supersedes = $${paramIndex++}`);
      values.push(input.supersedes);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE entries SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!result.rows[0]) return null;

    // Update tags if provided
    if (input.tags !== undefined) {
      await this.setEntryTags(id, input.tags);
    }

    const entry = this.rowToEntry(result.rows[0]);
    entry.tags = await this.getEntryTags(id);
    return entry;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM entries WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listEntries(filters?: EntryFilters): Promise<PaginatedResult<Entry>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      values.push(filters.projectId);
    }
    if (filters?.type && filters.type.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      values.push(filters.type);
    }
    if (filters?.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(filters.status);
    }
    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`id IN (SELECT entry_id FROM entry_tags WHERE tag = ANY($${paramIndex++}))`);
      values.push(filters.tags);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM entries ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get entries
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT * FROM entries ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    const entries = await Promise.all(
      result.rows.map(async (row) => {
        const entry = this.rowToEntry(row);
        entry.tags = await this.getEntryTags(entry.id);
        return entry;
      })
    );

    return {
      items: entries,
      total,
      limit,
      offset,
    };
  }

  // === Tags ===

  async getEntryTags(entryId: string): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT tag FROM entry_tags WHERE entry_id = $1 ORDER BY tag',
      [entryId]
    );
    return result.rows.map((row) => row.tag);
  }

  async setEntryTags(entryId: string, tags: string[]): Promise<void> {
    await this.pool.query('DELETE FROM entry_tags WHERE entry_id = $1', [entryId]);

    if (tags.length > 0) {
      const values = tags.map((tag, i) => `($1, $${i + 2})`).join(', ');
      await this.pool.query(`INSERT INTO entry_tags (entry_id, tag) VALUES ${values}`, [
        entryId,
        ...tags,
      ]);
    }
  }

  async getAllTags(): Promise<string[]> {
    const result = await this.pool.query('SELECT DISTINCT tag FROM entry_tags ORDER BY tag');
    return result.rows.map((row) => row.tag);
  }

  // === Relations ===

  async createRelation(input: CreateRelationInput): Promise<EntryRelation> {
    const result = await this.pool.query(
      `INSERT INTO entry_relations (from_id, to_id, relation_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (from_id, to_id) DO UPDATE SET relation_type = $3
       RETURNING *`,
      [input.fromId, input.toId, input.relationType ?? 'related']
    );

    return this.rowToRelation(result.rows[0]);
  }

  async getRelation(fromId: string, toId: string): Promise<EntryRelation | null> {
    const result = await this.pool.query(
      'SELECT * FROM entry_relations WHERE from_id = $1 AND to_id = $2',
      [fromId, toId]
    );
    return result.rows[0] ? this.rowToRelation(result.rows[0]) : null;
  }

  async deleteRelation(fromId: string, toId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM entry_relations WHERE from_id = $1 AND to_id = $2',
      [fromId, toId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getEntryRelations(entryId: string): Promise<EntryRelation[]> {
    const result = await this.pool.query(
      'SELECT * FROM entry_relations WHERE from_id = $1 OR to_id = $1',
      [entryId]
    );
    return result.rows.map((row) => this.rowToRelation(row));
  }

  async getRelatedEntries(entryId: string): Promise<Entry[]> {
    const result = await this.pool.query(
      `SELECT e.* FROM entries e
       JOIN entry_relations r ON (e.id = r.to_id AND r.from_id = $1) OR (e.id = r.from_id AND r.to_id = $1)
       WHERE e.id != $1`,
      [entryId]
    );

    return Promise.all(
      result.rows.map(async (row) => {
        const entry = this.rowToEntry(row);
        entry.tags = await this.getEntryTags(entry.id);
        return entry;
      })
    );
  }

  // === Search ===

  async searchEntries(query: string, filters?: EntryFilters): Promise<PaginatedResult<Entry>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Full-text search
    conditions.push(
      `to_tsvector('english', title || ' ' || content || ' ' || COALESCE(context_summary, '')) @@ plainto_tsquery('english', $${paramIndex++})`
    );
    values.push(query);

    if (filters?.projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      values.push(filters.projectId);
    }
    if (filters?.type && filters.type.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      values.push(filters.type);
    }
    if (filters?.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(filters.status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM entries ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get entries with ranking
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT *,
        ts_rank(to_tsvector('english', title || ' ' || content || ' ' || COALESCE(context_summary, '')), plainto_tsquery('english', $1)) as rank
       FROM entries ${whereClause}
       ORDER BY rank DESC, updated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    const entries = await Promise.all(
      result.rows.map(async (row) => {
        const entry = this.rowToEntry(row);
        entry.tags = await this.getEntryTags(entry.id);
        return entry;
      })
    );

    return {
      items: entries,
      total,
      limit,
      offset,
    };
  }

  // === User Management (Team Mode) ===

  async createUser(
    email: string,
    name: string,
    passwordHash?: string
  ): Promise<{ id: string; email: string; name: string }> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name`,
      [id, email, name, passwordHash ?? null]
    );
    return result.rows[0];
  }

  async getUserByEmail(
    email: string
  ): Promise<{ id: string; email: string; name: string; passwordHash?: string } | null> {
    const result = await this.pool.query(
      'SELECT id, email, name, password_hash as "passwordHash" FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  async getUserById(id: string): Promise<{ id: string; email: string; name: string } | null> {
    const result = await this.pool.query('SELECT id, email, name FROM users WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  // === API Keys ===

  async createApiKey(
    userId: string,
    keyHash: string,
    name: string,
    expiresAt?: Date
  ): Promise<{ id: string }> {
    const id = generateId();
    await this.pool.query(
      `INSERT INTO api_keys (id, user_id, key_hash, name, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, keyHash, name, expiresAt ?? null]
    );
    return { id };
  }

  async getApiKeyByHash(
    keyHash: string
  ): Promise<{ id: string; userId: string; expiresAt?: Date } | null> {
    const result = await this.pool.query(
      `SELECT id, user_id as "userId", expires_at as "expiresAt"
       FROM api_keys
       WHERE key_hash = $1`,
      [keyHash]
    );
    return result.rows[0] ?? null;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
  }

  // === Helpers ===

  private rowToProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      description: row.description as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToEntry(row: Record<string, unknown>): Entry {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      title: row.title as string,
      type: row.type as Entry['type'],
      status: row.status as Entry['status'],
      content: row.content as string,
      contextSummary: row.context_summary as string | undefined,
      tags: [], // Loaded separately
      supersedes: row.supersedes as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToRelation(row: Record<string, unknown>): EntryRelation {
    return {
      fromId: row.from_id as string,
      toId: row.to_id as string,
      relationType: row.relation_type as EntryRelation['relationType'],
    };
  }
}

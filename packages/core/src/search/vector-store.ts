import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Vector store using sqlite-vec extension
 * Manages embedding storage and similarity search
 */
export class VectorStore {
  private db: DatabaseType;
  private dimensions: number;
  private tableName = 'entry_embeddings';
  private initialized = false;

  constructor(db: DatabaseType, dimensions: number) {
    this.db = db;
    this.dimensions = dimensions;
  }

  /**
   * Initialize the vector store
   * Creates the virtual table for embeddings
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load sqlite-vec extension
      // The extension is loaded dynamically based on platform
      await this.loadExtension();

      // Create the virtual table for vector storage
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING vec0(
          entry_id TEXT PRIMARY KEY,
          embedding FLOAT[${this.dimensions}]
        )
      `);

      this.initialized = true;
    } catch (error) {
      // sqlite-vec might not be available, that's okay
      // Search will fall back to FTS5 only
      console.warn('sqlite-vec extension not available. Semantic search will be disabled.', error);
    }
  }

  /**
   * Load the sqlite-vec extension
   */
  private async loadExtension(): Promise<void> {
    try {
      // Try to load sqlite-vec
      // The extension path varies by platform
      const sqliteVec = await import('sqlite-vec');
      sqliteVec.load(this.db);
    } catch {
      // Extension not available
      throw new Error('sqlite-vec extension not installed');
    }
  }

  /**
   * Check if vector store is available
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Store an embedding for an entry
   */
  async upsert(entryId: string, embedding: Float32Array): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector store not initialized');
    }

    // Convert Float32Array to blob
    const blob = Buffer.from(embedding.buffer);

    // sqlite-vec virtual tables don't support INSERT OR REPLACE
    // So we delete first if exists, then insert
    const deleteStmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE entry_id = ?`);
    deleteStmt.run(entryId);

    const insertStmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (entry_id, embedding)
      VALUES (?, ?)
    `);
    insertStmt.run(entryId, blob);
  }

  /**
   * Delete an embedding
   */
  async delete(entryId: string): Promise<void> {
    if (!this.initialized) return;

    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE entry_id = ?`);
    stmt.run(entryId);
  }

  /**
   * Search for similar entries
   * Returns entry IDs with similarity scores
   */
  async search(
    queryEmbedding: Float32Array,
    limit: number = 10
  ): Promise<{ entryId: string; similarity: number }[]> {
    if (!this.initialized) {
      return [];
    }

    const blob = Buffer.from(queryEmbedding.buffer);

    // Use cosine distance for similarity search
    // vec0 uses distance, so we convert to similarity (1 - distance)
    const stmt = this.db.prepare(`
      SELECT
        entry_id,
        1 - vec_distance_cosine(embedding, ?) as similarity
      FROM ${this.tableName}
      ORDER BY similarity DESC
      LIMIT ?
    `);

    const rows = stmt.all(blob, limit) as { entry_id: string; similarity: number }[];

    return rows.map((row) => ({
      entryId: row.entry_id,
      similarity: row.similarity,
    }));
  }

  /**
   * Get embedding for an entry
   */
  async get(entryId: string): Promise<Float32Array | null> {
    if (!this.initialized) return null;

    const stmt = this.db.prepare(`
      SELECT embedding FROM ${this.tableName} WHERE entry_id = ?
    `);

    const row = stmt.get(entryId) as { embedding: Buffer } | undefined;
    if (!row) return null;

    return new Float32Array(row.embedding.buffer);
  }

  /**
   * Check if an entry has an embedding
   */
  async has(entryId: string): Promise<boolean> {
    if (!this.initialized) return false;

    const stmt = this.db.prepare(`
      SELECT 1 FROM ${this.tableName} WHERE entry_id = ? LIMIT 1
    `);

    return stmt.get(entryId) !== undefined;
  }

  /**
   * Get count of stored embeddings
   */
  async count(): Promise<number> {
    if (!this.initialized) return 0;

    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const row = stmt.get() as { count: number };
    return row.count;
  }
}

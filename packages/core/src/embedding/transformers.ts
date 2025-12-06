import type { IEmbeddingProvider } from './provider.js';
import { EmbeddingError } from './provider.js';

/**
 * Local embedding provider using Transformers.js
 * No API keys required, runs entirely locally
 * Uses all-MiniLM-L6-v2 model (384 dimensions)
 */
export class TransformersJsProvider implements IEmbeddingProvider {
  readonly name = 'transformers.js';
  readonly dimensions = 384; // all-MiniLM-L6-v2
  readonly maxInputLength = 512; // tokens
  readonly maxBatchSize = 32;

  private pipeline: unknown = null;
  private modelId: string;
  private initialized = false;

  constructor(modelId: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelId = modelId;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid loading transformers.js if not needed
      const { pipeline } = await import('@xenova/transformers');

      this.pipeline = await pipeline('feature-extraction', this.modelId, {
        quantized: true, // Use quantized model for smaller size
      });

      this.initialized = true;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to initialize TransformersJS: ${error}`,
        this.name,
        error
      );
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const pipe = this.pipeline as (
        text: string,
        options: { pooling: string; normalize: boolean }
      ) => Promise<{ data: number[] }>;

      const result = await pipe(text, {
        pooling: 'mean',
        normalize: true,
      });

      return new Float32Array(result.data);
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate embedding: ${error}`,
        this.name,
        error
      );
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Process in batches to avoid memory issues
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...embeddings);
    }

    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if transformers.js can be imported
      await import('@xenova/transformers');
      return true;
    } catch {
      return false;
    }
  }
}

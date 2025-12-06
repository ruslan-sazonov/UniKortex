import type { IEmbeddingProvider } from './provider.js';
import { EmbeddingError } from './provider.js';

/**
 * Embedding provider using OpenAI API
 * Requires OPENAI_API_KEY environment variable
 * Default model: text-embedding-3-small (512 dimensions, configurable)
 */
export class OpenAIProvider implements IEmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  readonly maxInputLength = 8191; // tokens
  readonly maxBatchSize = 2048;

  private apiKey: string;
  private model: string;
  private initialized = false;

  constructor(
    apiKey?: string,
    model: string = 'text-embedding-3-small',
    dimensions: number = 512
  ) {
    this.apiKey = apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = model;
    this.dimensions = dimensions;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.apiKey) {
      throw new EmbeddingError(
        'OpenAI API key not provided. Set OPENAI_API_KEY environment variable.',
        this.name
      );
    }

    // Verify API key works
    const available = await this.isAvailable();
    if (!available) {
      throw new EmbeddingError('OpenAI API key is invalid or API is unavailable', this.name);
    }

    this.initialized = true;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          dimensions: this.dimensions,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message ?? 'Unknown error'}`
        );
      }

      const data = (await response.json()) as {
        data: { embedding: number[] }[];
      };

      return new Float32Array(data.data[0]?.embedding ?? []);
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate embedding with OpenAI: ${error}`,
        this.name,
        error
      );
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // OpenAI supports batch embedding natively
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message ?? 'Unknown error'}`
        );
      }

      const data = (await response.json()) as {
        data: { embedding: number[]; index: number }[];
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((d) => new Float32Array(d.embedding));
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate batch embeddings with OpenAI: ${error}`,
        this.name,
        error
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      // Make a minimal API call to verify the key works
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

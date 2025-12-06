import type { IEmbeddingProvider } from './provider.js';
import { EmbeddingError } from './provider.js';

/**
 * Embedding provider using Ollama
 * Requires Ollama running locally with an embedding model
 * Default model: nomic-embed-text (768 dimensions)
 */
export class OllamaProvider implements IEmbeddingProvider {
  readonly name = 'ollama';
  readonly dimensions: number;
  readonly maxInputLength = 8192;
  readonly maxBatchSize = 64;

  private host: string;
  private model: string;
  private initialized = false;

  constructor(
    host: string = 'http://localhost:11434',
    model: string = 'nomic-embed-text'
  ) {
    this.host = host.replace(/\/$/, ''); // Remove trailing slash
    this.model = model;

    // Set dimensions based on model
    // nomic-embed-text: 768
    // mxbai-embed-large: 1024
    // all-minilm: 384
    this.dimensions = this.getDimensionsForModel(model);
  }

  private getDimensionsForModel(model: string): number {
    const modelDimensions: Record<string, number> = {
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
      'snowflake-arctic-embed': 1024,
    };
    return modelDimensions[model] ?? 768;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Verify Ollama is running and model is available
    const available = await this.isAvailable();
    if (!available) {
      throw new EmbeddingError(
        `Ollama is not available at ${this.host} or model ${this.model} is not installed`,
        this.name
      );
    }

    this.initialized = true;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const response = await fetch(`${this.host}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      return new Float32Array(data.embedding);
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate embedding with Ollama: ${error}`,
        this.name,
        error
      );
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Ollama doesn't support native batching, so parallelize requests
    // Limit concurrency to avoid overwhelming the server
    const concurrency = 8;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...embeddings);
    }

    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return false;

      // Check if the model is available
      const data = (await response.json()) as { models: { name: string }[] };
      const modelNames = data.models.map((m) => m.name.split(':')[0]);

      return modelNames.includes(this.model);
    } catch {
      return false;
    }
  }
}

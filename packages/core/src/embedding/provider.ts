/**
 * Abstract interface for embedding providers
 * Implemented by TransformersJS (local), Ollama, and OpenAI
 */
export interface IEmbeddingProvider {
  /** Provider name for logging/config */
  readonly name: string;

  /** Dimensions of the embedding vectors */
  readonly dimensions: number;

  /** Maximum tokens/characters per input */
  readonly maxInputLength: number;

  /** Maximum batch size for embedBatch */
  readonly maxBatchSize: number;

  /**
   * Initialize the provider (download models, etc.)
   * Called once before first use
   */
  initialize(): Promise<void>;

  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<Float32Array>;

  /**
   * Generate embeddings for multiple texts
   * More efficient than calling embed() multiple times
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Configuration for embedding providers
 */
export interface EmbeddingConfig {
  provider: 'auto' | 'local' | 'ollama' | 'openai';

  local?: {
    model?: string;
  };

  ollama?: {
    host?: string;
    model?: string;
  };

  openai?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_EMBEDDING_CONFIG: Required<EmbeddingConfig> = {
  provider: 'auto',
  local: {
    model: 'Xenova/all-MiniLM-L6-v2',
  },
  ollama: {
    host: 'http://localhost:11434',
    model: 'nomic-embed-text',
  },
  openai: {
    apiKey: '',
    model: 'text-embedding-3-small',
    dimensions: 512,
  },
};

/**
 * Error thrown by embedding providers
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

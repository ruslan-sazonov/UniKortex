import type { IEmbeddingProvider, EmbeddingConfig } from './provider.js';
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingError } from './provider.js';
import { TransformersJsProvider } from './transformers.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';

/**
 * Embedding service that manages provider selection and initialization
 */
export class EmbeddingService {
  private provider: IEmbeddingProvider | null = null;
  private config: EmbeddingConfig;
  private initialized = false;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      ...DEFAULT_EMBEDDING_CONFIG,
      ...config,
    };
  }

  /**
   * Get the current embedding dimensions
   */
  get dimensions(): number {
    if (!this.provider) {
      throw new EmbeddingError('Embedding service not initialized', 'service');
    }
    return this.provider.dimensions;
  }

  /**
   * Get the current provider name
   */
  get providerName(): string {
    return this.provider?.name ?? 'none';
  }

  /**
   * Initialize the embedding service
   * Auto-selects provider if configured
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.provider = await this.selectProvider();
    await this.provider.initialize();
    this.initialized = true;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.provider!.embed(text);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.provider!.embedBatch(texts);
  }

  /**
   * Check if a specific provider is available
   */
  async checkProvider(providerName: string): Promise<boolean> {
    const provider = this.createProvider(providerName);
    return provider.isAvailable();
  }

  /**
   * Select the best available provider based on config
   */
  private async selectProvider(): Promise<IEmbeddingProvider> {
    const { provider: preferredProvider } = this.config;

    if (preferredProvider === 'auto') {
      return this.autoSelectProvider();
    }

    return this.createProvider(preferredProvider);
  }

  /**
   * Auto-select provider based on availability
   * Priority: OpenAI (if key set) > Ollama (if running) > Local
   */
  private async autoSelectProvider(): Promise<IEmbeddingProvider> {
    // Try OpenAI first if API key is available
    if (process.env['OPENAI_API_KEY'] || this.config.openai?.apiKey) {
      const openai = this.createProvider('openai');
      if (await openai.isAvailable()) {
        return openai;
      }
    }

    // Try Ollama if running locally
    const ollama = this.createProvider('ollama');
    if (await ollama.isAvailable()) {
      return ollama;
    }

    // Fall back to local transformers.js
    const local = this.createProvider('local');
    if (await local.isAvailable()) {
      return local;
    }

    throw new EmbeddingError(
      'No embedding provider available. Install @xenova/transformers for local embeddings, ' +
        'or configure Ollama/OpenAI.',
      'service'
    );
  }

  /**
   * Create a provider instance by name
   */
  private createProvider(name: string): IEmbeddingProvider {
    switch (name) {
      case 'openai':
        return new OpenAIProvider(
          this.config.openai?.apiKey,
          this.config.openai?.model,
          this.config.openai?.dimensions
        );

      case 'ollama':
        return new OllamaProvider(this.config.ollama?.host, this.config.ollama?.model);

      case 'local':
      case 'transformers':
        return new TransformersJsProvider(this.config.local?.model);

      default:
        throw new EmbeddingError(`Unknown embedding provider: ${name}`, 'service');
    }
  }
}

/**
 * Prepare text for embedding
 * Combines title, summary, and tags for optimal embedding
 */
export function prepareTextForEmbedding(
  title: string,
  content: string,
  tags: string[] = [],
  contextSummary?: string
): string {
  const parts: string[] = [title];

  // Use context summary if available, otherwise extract first paragraph
  if (contextSummary) {
    parts.push(contextSummary);
  } else {
    const firstParagraph = extractFirstParagraph(content);
    if (firstParagraph) {
      parts.push(firstParagraph);
    }
  }

  if (tags.length > 0) {
    parts.push(tags.join(' '));
  }

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Extract the first meaningful paragraph from content
 */
function extractFirstParagraph(content: string): string {
  // Skip any frontmatter
  let text = content;
  if (text.startsWith('---')) {
    const endIndex = text.indexOf('---', 3);
    if (endIndex !== -1) {
      text = text.slice(endIndex + 3).trim();
    }
  }

  // Skip headers at the beginning
  const lines = text.split('\n');
  let startIdx = 0;
  while (startIdx < lines.length) {
    const line = lines[startIdx];
    if (line && !line.startsWith('#') && line.trim() !== '') {
      break;
    }
    startIdx++;
  }

  // Collect paragraph lines
  const paragraphLines: string[] = [];
  for (let i = startIdx; i < lines.length && paragraphLines.length < 5; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() === '') {
      if (paragraphLines.length > 0) break;
      continue;
    }
    if (line.startsWith('#')) break;
    paragraphLines.push(line);
  }

  return paragraphLines.join(' ').trim().slice(0, 500);
}

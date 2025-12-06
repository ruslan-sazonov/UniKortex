import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import { HybridSearchEngine, EmbeddingService, VectorStore } from '@unikortex/core';

export const reindexCommand = new Command('reindex')
  .description('Rebuild the search index for semantic search')
  .action(async () => {
    try {
      await withContext(async (ctx) => {
        console.log(chalk.blue('Initializing embedding service...'));

        // Initialize embedding service
        let embeddingService: EmbeddingService;
        try {
          embeddingService = new EmbeddingService(ctx.config.embedding);
          await embeddingService.initialize();
          console.log(chalk.green(`✓ Using ${embeddingService.providerName} embeddings`));
        } catch (error) {
          console.error(chalk.red('Failed to initialize embedding service:'));
          console.error(chalk.dim((error as Error).message));
          console.error('');
          console.error(chalk.yellow('To enable semantic search, you need one of:'));
          console.error(chalk.dim('  - @xenova/transformers installed (local, no API key)'));
          console.error(chalk.dim('  - Ollama running with nomic-embed-text model'));
          console.error(chalk.dim('  - OPENAI_API_KEY environment variable set'));
          process.exit(1);
        }

        // Initialize vector store
        console.log(chalk.blue('Initializing vector store...'));
        const db = (ctx.storage as unknown as { db: unknown }).db;
        const vectorStore = new VectorStore(
          db as Parameters<ConstructorParameters<typeof VectorStore>[0]>,
          embeddingService.dimensions
        );

        try {
          await vectorStore.initialize();
          console.log(chalk.green('✓ Vector store initialized'));
        } catch (error) {
          console.error(chalk.red('Failed to initialize vector store:'));
          console.error(chalk.dim((error as Error).message));
          console.error('');
          console.error(chalk.yellow('sqlite-vec extension may not be available.'));
          process.exit(1);
        }

        // Create search engine and reindex
        const searchEngine = new HybridSearchEngine(ctx.storage, embeddingService, vectorStore);

        console.log(chalk.blue('Indexing entries...'));
        const count = await searchEngine.reindexAll((current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total} entries`);
        });

        console.log(''); // New line after progress
        console.log(chalk.green(`✓ Indexed ${count} entries`));
        console.log('');
        console.log(chalk.dim('You can now use semantic search:'));
        console.log(chalk.dim('  unikortex search "your query" --mode semantic'));
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

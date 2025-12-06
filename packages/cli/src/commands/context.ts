import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import type { EntryType, EntryStatus } from '@unikortex/core';
import {
  ContextRetriever,
  EmbeddingService,
  VectorStore,
} from '@unikortex/core';

interface ContextOptions {
  project?: string;
  type?: string;
  status?: string;
  maxTokens?: string;
  maxItems?: string;
  related?: boolean;
  format?: 'markdown' | 'xml' | 'json';
}

export const contextCommand = new Command('context')
  .description('Retrieve relevant context for LLM consumption')
  .argument('<query>', 'Query to find relevant context')
  .option('-p, --project <project>', 'Filter by project name')
  .option('--type <type>', 'Filter by type (decision, research, artifact, note, reference)')
  .option('--status <status>', 'Filter by status (draft, active, superseded, archived)')
  .option('-t, --max-tokens <tokens>', 'Maximum tokens to return', '4000')
  .option('-n, --max-items <items>', 'Maximum items to return', '10')
  .option('-r, --related', 'Include related entries')
  .option('--format <format>', 'Output format (markdown, xml, json)', 'markdown')
  .action(async (query: string, options: ContextOptions) => {
    try {
      await withContext(async (ctx) => {
        // Build filters
        let projectId: string | undefined;

        if (options.project) {
          const project = await ctx.projects.getByName(options.project);
          if (!project) {
            console.error(chalk.red(`Project "${options.project}" not found.`));
            process.exit(1);
          }
          projectId = project.id;
        }

        const filters = {
          projectId,
          type: options.type ? [options.type as EntryType] : undefined,
          status: options.status ? [options.status as EntryStatus] : undefined,
        };

        // Initialize context retriever with embedding service if available
        let embeddingService: EmbeddingService | undefined;
        let vectorStore: VectorStore | undefined;

        try {
          embeddingService = new EmbeddingService(ctx.config.embedding);
          await embeddingService.initialize();

          const db = (ctx.storage as unknown as { db: unknown }).db;
          vectorStore = new VectorStore(
            db as Parameters<typeof VectorStore.prototype.initialize>[0] extends void
              ? never
              : Parameters<ConstructorParameters<typeof VectorStore>[0]>,
            embeddingService.dimensions
          );
          await vectorStore.initialize();
        } catch {
          // Semantic search not available, will use keyword only
        }

        const retriever = new ContextRetriever(ctx.storage, embeddingService, vectorStore);

        const result = await retriever.retrieve({
          query,
          maxTokens: parseInt(options.maxTokens ?? '4000', 10),
          maxItems: parseInt(options.maxItems ?? '10', 10),
          filters,
          includeRelated: options.related ?? false,
        });

        if (result.items.length === 0) {
          console.log(chalk.yellow('No relevant context found.'));
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else if (options.format === 'xml') {
          // XML format for LLM consumption
          const formatted = retriever.formatForLLM(result, 'xml');
          console.log(formatted);
        } else {
          // Markdown format (default)
          const formatted = retriever.formatForLLM(result, 'markdown');
          console.log(formatted);
          console.log('');
          console.log(
            chalk.dim(
              `--- ${result.items.length} items | ~${result.totalTokensEstimate} tokens` +
                (result.truncated ? ' | truncated' : '')
            )
          );
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

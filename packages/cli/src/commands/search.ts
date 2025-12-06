import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import { formatEntriesTable } from '../output/table.js';
import { formatEntriesJson, formatEntryIds } from '../output/json.js';
import type { EntryType, EntryStatus, SearchMode } from '@unikortex/core';
import { HybridSearchEngine, EmbeddingService, VectorStore, loadConfig } from '@unikortex/core';

interface SearchOptions {
  project?: string;
  all?: boolean;
  type?: string;
  status?: string;
  mode?: string;
  limit?: string;
  minScore?: string;
  format?: 'table' | 'json' | 'ids' | 'detailed';
}

export const searchCommand = new Command('search')
  .description('Search entries using keyword and/or semantic search')
  .argument('<query>', 'Search query')
  .option('-p, --project <project>', 'Filter by project name (defaults to active project)')
  .option('-a, --all', 'Search all projects (ignore active project)')
  .option('--type <type>', 'Filter by type (decision, research, artifact, note, reference)')
  .option('--status <status>', 'Filter by status (draft, active, superseded, archived)')
  .option('-m, --mode <mode>', 'Search mode (hybrid, semantic, keyword)', 'hybrid')
  .option('-l, --limit <limit>', 'Maximum results to return', '10')
  .option('--min-score <score>', 'Minimum relevance score 0-1 (default: 0.3 for semantic)')
  .option('--format <format>', 'Output format (table, json, ids, detailed)', 'table')
  .action(async (query: string, options: SearchOptions) => {
    try {
      await withContext(async (ctx) => {
        const config = loadConfig();

        // Build filters - use active project by default
        let projectId: string | undefined;
        let scopeDescription: string;

        if (options.all) {
          // Explicit global search
          projectId = undefined;
          scopeDescription = 'all projects';
        } else if (options.project) {
          // Explicit project filter
          const project = await ctx.projects.getByName(options.project);
          if (!project) {
            console.error(chalk.red(`Project "${options.project}" not found.`));
            process.exit(1);
          }
          projectId = project.id;
          scopeDescription = `project "${options.project}"`;
        } else if (config.activeProject) {
          // Use active project
          const project = await ctx.projects.getByName(config.activeProject);
          if (project) {
            projectId = project.id;
            scopeDescription = `project "${config.activeProject}" (active)`;
          } else {
            scopeDescription = 'all projects';
          }
        } else {
          scopeDescription = 'all projects';
        }

        const filters = {
          projectId,
          type: options.type ? [options.type as EntryType] : undefined,
          status: options.status ? [options.status as EntryStatus] : undefined,
        };

        // Initialize search engine
        let embeddingService: EmbeddingService | undefined;
        let vectorStore: VectorStore | undefined;

        const mode = (options.mode ?? 'hybrid') as SearchMode;

        // Only initialize embedding/vector services if needed for semantic search
        if (mode !== 'keyword') {
          try {
            embeddingService = new EmbeddingService(ctx.config.embedding);
            await embeddingService.initialize();

            // Get the underlying database from storage
            const db = (ctx.storage as unknown as { db: unknown }).db;
            vectorStore = new VectorStore(
              db as Parameters<typeof VectorStore.prototype.initialize>[0] extends void
                ? never
                : Parameters<ConstructorParameters<typeof VectorStore>[0]>,
              embeddingService.dimensions
            );
            await vectorStore.initialize();
          } catch (error) {
            if (mode === 'semantic') {
              console.error(
                chalk.yellow('Semantic search not available. Falling back to keyword search.')
              );
              console.error(chalk.dim((error as Error).message));
            }
            // For hybrid mode, silently fall back to keyword search
          }
        }

        const searchEngine = new HybridSearchEngine(ctx.storage, embeddingService, vectorStore);

        const results = await searchEngine.search({
          query,
          mode,
          filters,
          limit: parseInt(options.limit ?? '10', 10),
          minScore: options.minScore ? parseFloat(options.minScore) : undefined,
        });

        if (results.length === 0) {
          console.log(chalk.yellow('No results found.'));
          return;
        }

        if (options.format === 'json') {
          console.log(formatEntriesJson(results.map((r) => r.entry)));
        } else if (options.format === 'ids') {
          console.log(formatEntryIds(results.map((r) => r.entry)));
        } else if (options.format === 'detailed') {
          // Show detailed results with scores
          console.log(chalk.bold(`Found ${results.length} results:\n`));
          for (const result of results) {
            console.log(chalk.cyan.bold(result.entry.title));
            console.log(chalk.dim(`ID: ${result.entry.id}`));
            console.log(chalk.dim(`Type: ${result.entry.type} | Status: ${result.entry.status}`));
            console.log(
              chalk.dim(
                `Score: ${result.score.toFixed(4)} ` +
                  `(semantic: ${result.scoreBreakdown.semantic.toFixed(4)}, ` +
                  `keyword: ${result.scoreBreakdown.keyword.toFixed(4)})`
              )
            );
            if (result.entry.tags.length > 0) {
              console.log(chalk.dim(`Tags: ${result.entry.tags.join(', ')}`));
            }
            if (result.entry.contextSummary) {
              console.log(chalk.dim(`Summary: ${result.entry.contextSummary.slice(0, 100)}...`));
            }
            console.log('');
          }
        } else {
          // Default table format
          console.log(formatEntriesTable(results.map((r) => r.entry)));
          console.log('');
          console.log(
            chalk.dim(
              `Scope: ${scopeDescription} | Mode: ${mode}` +
                (embeddingService ? ` | Embedding: ${embeddingService.providerName}` : '')
            )
          );
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import { formatEntryDetails, formatRelationsTable } from '../output/table.js';
import { formatJson } from '../output/json.js';

interface ShowOptions {
  includeRelated?: boolean;
  format?: 'table' | 'json';
}

export const showCommand = new Command('show')
  .description('Show details of an entry')
  .argument('<id>', 'Entry ID')
  .option('-r, --include-related', 'Include related entries')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (id: string, options: ShowOptions) => {
    try {
      await withContext(async (ctx) => {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          console.error(chalk.red(`Entry "${id}" not found.`));
          process.exit(1);
        }

        const project = await ctx.projects.get(entry.projectId);

        if (options.format === 'json') {
          const data: Record<string, unknown> = { ...entry, project };

          if (options.includeRelated) {
            const relations = await ctx.relations.getRelations(id);
            const relatedEntries = await ctx.relations.getRelatedEntries(id);
            data.relations = relations;
            data.relatedEntries = relatedEntries;
          }

          console.log(formatJson(data));
        } else {
          console.log(formatEntryDetails(entry, project?.name));

          if (options.includeRelated) {
            const relations = await ctx.relations.getRelations(id);
            if (relations.length > 0) {
              console.log('');
              console.log(chalk.bold('Relations:'));
              console.log(formatRelationsTable(relations, id));
            }
          }
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

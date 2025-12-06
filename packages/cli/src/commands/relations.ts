import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import { formatRelationsTable } from '../output/table.js';
import { formatRelationsJson } from '../output/json.js';

interface RelationsOptions {
  format?: 'table' | 'json';
}

export const relationsCommand = new Command('relations')
  .description('List relations for an entry')
  .argument('<id>', 'Entry ID')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (id: string, options: RelationsOptions) => {
    try {
      await withContext(async (ctx) => {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          console.error(chalk.red(`Entry "${id}" not found.`));
          process.exit(1);
        }

        const relations = await ctx.relations.getRelations(id);

        if (options.format === 'json') {
          console.log(formatRelationsJson(relations));
        } else {
          console.log(chalk.bold(`Relations for: ${entry.title}`));
          console.log('');
          console.log(formatRelationsTable(relations, id));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { withContext } from '../utils/context.js';
import { formatJson } from '../output/json.js';
import type { RelationType } from '@unikortex/core';

interface RelateOptions {
  type?: string;
  format?: 'table' | 'json';
}

export const relateCommand = new Command('relate')
  .description('Create a relation between two entries')
  .argument('<from-id>', 'Source entry ID')
  .argument('<to-id>', 'Target entry ID')
  .option(
    '-t, --type <type>',
    'Relation type (related, implements, extends, contradicts)',
    'related'
  )
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (fromId: string, toId: string, options: RelateOptions) => {
    try {
      await withContext(async (ctx) => {
        const spinner = ora('Creating relation...').start();

        const relation = await ctx.relations.create({
          fromId,
          toId,
          relationType: (options.type ?? 'related') as RelationType,
        });

        spinner.succeed('Relation created!');
        console.log('');

        if (options.format === 'json') {
          console.log(formatJson(relation));
        } else {
          // Get entry details for display
          const fromEntry = await ctx.entries.get(fromId);
          const toEntry = await ctx.entries.get(toId);

          console.log(
            `${chalk.cyan(fromEntry?.title ?? fromId)} ` +
              `${chalk.dim('─')}${chalk.yellow(relation.relationType)}${chalk.dim('→')} ` +
              `${chalk.cyan(toEntry?.title ?? toId)}`
          );
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

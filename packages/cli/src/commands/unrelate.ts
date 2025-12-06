import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { withContext } from '../utils/context.js';

export const unrelateCommand = new Command('unrelate')
  .description('Remove a relation between two entries')
  .argument('<from-id>', 'Source entry ID')
  .argument('<to-id>', 'Target entry ID')
  .action(async (fromId: string, toId: string) => {
    try {
      await withContext(async (ctx) => {
        const spinner = ora('Removing relation...').start();

        const deleted = await ctx.relations.delete(fromId, toId);

        if (deleted) {
          spinner.succeed('Relation removed.');
        } else {
          spinner.warn('Relation not found.');
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { withContext } from '../utils/context.js';
import { formatEntryDetails } from '../output/table.js';
import { formatJson } from '../output/json.js';
import type { EntryType, EntryStatus } from '@unikortex/core';

interface UpdateOptions {
  title?: string;
  type?: string;
  status?: string;
  tags?: string;
  supersedes?: string;
  format?: 'table' | 'json';
}

export const updateCommand = new Command('update')
  .description('Update entry metadata')
  .argument('<id>', 'Entry ID')
  .option('-t, --title <title>', 'New title')
  .option('--type <type>', 'New type')
  .option('--status <status>', 'New status')
  .option('--tags <tags>', 'New tags (comma-separated, replaces existing)')
  .option('--supersedes <id>', 'ID of entry this supersedes')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (id: string, options: UpdateOptions) => {
    try {
      await withContext(async (ctx) => {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          console.error(chalk.red(`Entry "${id}" not found.`));
          process.exit(1);
        }

        // Build update object
        const updates: Record<string, unknown> = {};

        if (options.title) updates.title = options.title;
        if (options.type) updates.type = options.type as EntryType;
        if (options.status) updates.status = options.status as EntryStatus;
        if (options.tags) updates.tags = options.tags.split(',').map((t) => t.trim());
        if (options.supersedes) updates.supersedes = options.supersedes;

        if (Object.keys(updates).length === 0) {
          console.log(chalk.dim('No updates specified.'));
          return;
        }

        const spinner = ora('Updating entry...').start();

        const updated = await ctx.entries.update(id, updates);

        if (!updated) {
          spinner.fail('Failed to update entry');
          process.exit(1);
        }

        // Sync to vault if enabled
        if (ctx.config.vault?.enabled) {
          await ctx.vault.syncEntry(updated);
        }

        spinner.succeed('Entry updated!');
        console.log('');

        if (options.format === 'json') {
          console.log(formatJson(updated));
        } else {
          const project = await ctx.projects.get(updated.projectId);
          console.log(formatEntryDetails(updated, project?.name));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

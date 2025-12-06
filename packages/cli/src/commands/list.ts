import { Command } from 'commander';
import chalk from 'chalk';
import { withContext } from '../utils/context.js';
import { formatEntriesTable } from '../output/table.js';
import { formatEntriesJson, formatEntryIds } from '../output/json.js';
import type { EntryType, EntryStatus } from '@unikortex/core';
import { loadConfig } from '@unikortex/core';

interface ListOptions {
  project?: string;
  all?: boolean;
  type?: string;
  status?: string;
  tag?: string;
  limit?: string;
  offset?: string;
  format?: 'table' | 'json' | 'ids';
}

export const listCommand = new Command('list')
  .description('List entries in the knowledge base')
  .option('-p, --project <project>', 'Filter by project name (defaults to active project)')
  .option('-a, --all', 'List entries from all projects (ignore active project)')
  .option('--type <type>', 'Filter by type (decision, research, artifact, note, reference)')
  .option('--status <status>', 'Filter by status (draft, active, superseded, archived)')
  .option('--tag <tag>', 'Filter by tag')
  .option('-l, --limit <limit>', 'Maximum entries to return', '20')
  .option('-o, --offset <offset>', 'Skip entries', '0')
  .option('--format <format>', 'Output format (table, json, ids)', 'table')
  .action(async (options: ListOptions) => {
    try {
      await withContext(async (ctx) => {
        const config = loadConfig();

        // Build filters - use active project by default
        let projectId: string | undefined;
        let scopeDescription: string;

        if (options.all) {
          // Explicit global list
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
          tags: options.tag ? [options.tag] : undefined,
          limit: parseInt(options.limit ?? '20', 10),
          offset: parseInt(options.offset ?? '0', 10),
        };

        const result = await ctx.entries.list(filters);

        if (options.format === 'json') {
          console.log(formatEntriesJson(result.items));
        } else if (options.format === 'ids') {
          console.log(formatEntryIds(result.items));
        } else {
          console.log(formatEntriesTable(result.items));
          console.log('');
          console.log(chalk.dim(`Scope: ${scopeDescription}`));
          if (result.total > result.items.length) {
            console.log(
              chalk.dim(
                `Showing ${result.items.length} of ${result.total} entries. ` +
                  `Use --offset ${result.offset + result.limit} to see more.`
              )
            );
          }
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

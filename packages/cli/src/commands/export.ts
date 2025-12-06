import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { withContext } from '../utils/context.js';
import { formatJson } from '../output/json.js';

interface ExportOptions {
  project?: string;
  output: string;
  format?: 'markdown' | 'json';
}

export const exportCommand = new Command('export')
  .description('Export entries to files')
  .option('-p, --project <project>', 'Export only this project')
  .option('-o, --output <path>', 'Output directory or file', './export')
  .option('--format <format>', 'Export format (markdown, json)', 'markdown')
  .action(async (options: ExportOptions) => {
    try {
      await withContext(async (ctx) => {
        const spinner = ora('Exporting...').start();

        if (options.format === 'json') {
          // Export as single JSON file
          let entries;

          if (options.project) {
            const project = await ctx.projects.getByName(options.project);
            if (!project) {
              spinner.fail(`Project "${options.project}" not found.`);
              process.exit(1);
            }
            const result = await ctx.entries.list({ projectId: project.id, limit: 10000 });
            entries = result.items;
          } else {
            const result = await ctx.entries.list({ limit: 10000 });
            entries = result.items;
          }

          const projects = await ctx.projects.list();

          const exportData = {
            exportedAt: new Date().toISOString(),
            projects,
            entries,
          };

          const outputPath = options.output.endsWith('.json')
            ? options.output
            : `${options.output}/unikortex-export.json`;

          // Ensure directory exists
          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(outputPath, formatJson(exportData), 'utf-8');

          spinner.succeed(`Exported ${entries.length} entries to ${outputPath}`);
        } else {
          // Export as markdown files (sync to vault)
          if (options.project) {
            const project = await ctx.projects.getByName(options.project);
            if (!project) {
              spinner.fail(`Project "${options.project}" not found.`);
              process.exit(1);
            }

            const result = await ctx.vault.syncProject(project.id);
            spinner.succeed(`Exported ${result.synced} entries to vault`);

            if (result.errors.length > 0) {
              console.log('');
              console.log(chalk.yellow('Errors:'));
              for (const err of result.errors) {
                console.log(chalk.dim(`  - ${err}`));
              }
            }
          } else {
            const result = await ctx.vault.syncAll();
            spinner.succeed(`Exported ${result.synced} entries to vault`);

            if (result.errors.length > 0) {
              console.log('');
              console.log(chalk.yellow('Errors:'));
              for (const err of result.errors) {
                console.log(chalk.dim(`  - ${err}`));
              }
            }
          }

          console.log('');
          console.log(chalk.dim(`Vault location: ${ctx.vault.getVaultPath()}`));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

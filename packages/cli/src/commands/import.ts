import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import { withContext } from '../utils/context.js';
import type { Entry, Project } from '@unikortex/core';

interface ImportOptions {
  format?: 'markdown' | 'json';
}

export const importCommand = new Command('import')
  .description('Import entries from files')
  .argument('<path>', 'Path to import from (directory for markdown, file for JSON)')
  .option('--format <format>', 'Import format (markdown, json)', 'auto')
  .action(async (inputPath: string, options: ImportOptions) => {
    try {
      await withContext(async (ctx) => {
        if (!fs.existsSync(inputPath)) {
          console.error(chalk.red(`Path not found: ${inputPath}`));
          process.exit(1);
        }

        const isFile = fs.statSync(inputPath).isFile();
        const isJson = isFile && inputPath.endsWith('.json');

        // Auto-detect format
        const format = options.format === 'auto' ? (isJson ? 'json' : 'markdown') : options.format;

        const spinner = ora('Importing...').start();

        if (format === 'json') {
          // Import from JSON file
          if (!isFile) {
            spinner.fail('JSON import requires a file path.');
            process.exit(1);
          }

          const content = fs.readFileSync(inputPath, 'utf-8');
          const data = JSON.parse(content) as {
            projects?: Project[];
            entries?: Entry[];
          };

          let projectsCreated = 0;
          let entriesCreated = 0;

          // Import projects first
          if (data.projects) {
            for (const project of data.projects) {
              const existing = await ctx.projects.getByName(project.name);
              if (!existing) {
                await ctx.storage.createProject({
                  name: project.name,
                  displayName: project.displayName,
                  description: project.description,
                });
                projectsCreated++;
              }
            }
          }

          // Import entries
          if (data.entries) {
            for (const entry of data.entries) {
              const existing = await ctx.entries.get(entry.id);
              if (!existing) {
                // Get the project
                let project = await ctx.storage.getProject(entry.projectId);
                if (!project) {
                  // Try to find by name in the imported projects
                  const importedProject = data.projects?.find((p) => p.id === entry.projectId);
                  if (importedProject) {
                    project = await ctx.projects.getByName(importedProject.name);
                  }
                }

                if (project) {
                  await ctx.entries.create({
                    projectId: project.id,
                    title: entry.title,
                    type: entry.type,
                    status: entry.status,
                    content: entry.content,
                    contextSummary: entry.contextSummary,
                    tags: entry.tags,
                    supersedes: entry.supersedes ?? undefined,
                  });
                  entriesCreated++;
                }
              }
            }
          }

          spinner.succeed(
            `Imported ${projectsCreated} projects and ${entriesCreated} entries from JSON`
          );
        } else {
          // Import from markdown vault
          const result = await ctx.vault.importFromVault();

          spinner.succeed(
            `Imported ${result.imported} new entries, updated ${result.updated} existing entries`
          );

          if (result.errors.length > 0) {
            console.log('');
            console.log(chalk.yellow('Errors:'));
            for (const err of result.errors) {
              console.log(chalk.dim(`  - ${err}`));
            }
          }
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

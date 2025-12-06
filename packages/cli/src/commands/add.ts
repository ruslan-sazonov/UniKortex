import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as fs from 'node:fs';
import { withContext } from '../utils/context.js';
import { formatEntryDetails } from '../output/table.js';
import { formatJson } from '../output/json.js';
import type { EntryType, EntryStatus } from '@unikortex/core';
import { HybridSearchEngine, EmbeddingService, VectorStore, loadConfig } from '@unikortex/core';

interface AddOptions {
  title?: string;
  project?: string;
  type?: EntryType;
  status?: EntryStatus;
  tags?: string;
  file?: string;
  format?: 'table' | 'json';
}

export const addCommand = new Command('add')
  .description('Add a new entry to the knowledge base')
  .argument('[content]', 'Entry content (or use --file)')
  .option('-t, --title <title>', 'Entry title')
  .option('-p, --project <project>', 'Project name (defaults to active project)')
  .option('--type <type>', 'Entry type (decision, research, artifact, note, reference)')
  .option('--status <status>', 'Entry status (draft, active)', 'active')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('-f, --file <file>', 'Read content from file')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (contentArg: string | undefined, options: AddOptions) => {
    try {
      await withContext(async (ctx) => {
        const config = loadConfig();

        let content = contentArg;
        let title = options.title;
        // Use active project as default if not specified
        let projectName = options.project ?? config.activeProject;
        let type = options.type;
        const status = options.status ?? 'active';
        let tags: string[] = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];

        // Read content from file if specified
        if (options.file) {
          if (!fs.existsSync(options.file)) {
            console.error(chalk.red(`File not found: ${options.file}`));
            process.exit(1);
          }
          content = fs.readFileSync(options.file, 'utf-8');
        }

        // Read from stdin if piped
        if (!content && !process.stdin.isTTY) {
          content = fs.readFileSync(0, 'utf-8');
        }

        // Interactive mode if required fields are missing
        if (!title || !projectName || !type || !content) {
          const projects = await ctx.projects.list();

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'Entry title:',
              when: !title,
              validate: (input: string) => input.length > 0 || 'Title is required',
            },
            {
              type: 'list',
              name: 'project',
              message: 'Project:',
              when: !projectName,
              choices: [
                ...projects.map((p) => ({ name: `${p.displayName} (${p.name})`, value: p.name })),
                { name: chalk.green('+ Create new project'), value: '__new__' },
              ],
            },
            {
              type: 'input',
              name: 'newProjectName',
              message: 'New project name:',
              when: (ans: { project?: string }) => ans.project === '__new__',
              validate: (input: string) =>
                /^[a-z0-9-]+$/.test(input) || 'Use lowercase alphanumeric with hyphens',
            },
            {
              type: 'list',
              name: 'type',
              message: 'Entry type:',
              when: !type,
              choices: [
                { name: 'Decision - Architectural or design decisions', value: 'decision' },
                { name: 'Research - Findings, comparisons, analysis', value: 'research' },
                { name: 'Artifact - Code, configs, templates', value: 'artifact' },
                { name: 'Note - General notes, ideas', value: 'note' },
                { name: 'Reference - External resources, links', value: 'reference' },
              ],
            },
            {
              type: 'editor',
              name: 'content',
              message: 'Content (opens editor):',
              when: !content,
            },
            {
              type: 'input',
              name: 'tags',
              message: 'Tags (comma-separated, optional):',
              when: tags.length === 0,
            },
          ]);

          title = title ?? answers.title;
          type = type ?? answers.type;
          content = content ?? answers.content;

          if (answers.project === '__new__') {
            projectName = answers.newProjectName;
          } else {
            projectName = projectName ?? answers.project;
          }

          if (answers.tags) {
            tags = answers.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean);
          }
        }

        // Validate required fields
        if (!title || !projectName || !type || !content) {
          console.error(
            chalk.red('Missing required fields: title, project, type, and content are required.')
          );
          process.exit(1);
        }

        const spinner = ora('Creating entry...').start();

        // Get or create project
        const project = await ctx.projects.getOrCreate(projectName, projectName);

        // Create entry
        const entry = await ctx.entries.create({
          projectId: project.id,
          title,
          type: type as EntryType,
          status: status as EntryStatus,
          content,
          tags,
        });

        // Sync to vault if enabled
        if (ctx.config.vault?.enabled) {
          await ctx.vault.syncEntry(entry);
        }

        // Auto-index for semantic search if embedding service available
        try {
          const embeddingService = new EmbeddingService(ctx.config.embedding);
          await embeddingService.initialize();

          const db = (ctx.storage as unknown as { db: unknown }).db;
          const vectorStore = new VectorStore(
            db as Parameters<ConstructorParameters<typeof VectorStore>[0]>,
            embeddingService.dimensions
          );
          await vectorStore.initialize();

          const searchEngine = new HybridSearchEngine(ctx.storage, embeddingService, vectorStore);
          await searchEngine.indexEntry(entry);
        } catch {
          // Silently skip indexing if embedding service unavailable
        }

        spinner.succeed('Entry created!');
        console.log('');

        if (options.format === 'json') {
          console.log(formatJson(entry));
        } else {
          console.log(formatEntryDetails(entry, project.name));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

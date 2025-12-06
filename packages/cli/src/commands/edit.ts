import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { withContext } from '../utils/context.js';
import { formatEntryDetails } from '../output/table.js';

export const editCommand = new Command('edit')
  .description('Edit an entry in your default editor')
  .argument('<id>', 'Entry ID')
  .action(async (id: string) => {
    try {
      await withContext(async (ctx) => {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          console.error(chalk.red(`Entry "${id}" not found.`));
          process.exit(1);
        }

        // Create temp file with entry content
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `unikortex-${id}.md`);

        // Write current content
        fs.writeFileSync(tempFile, entry.content, 'utf-8');

        // Get editor from env
        const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? 'vi';

        // Open editor
        console.log(chalk.dim(`Opening ${editor}...`));

        await new Promise<void>((resolve, reject) => {
          const child = spawn(editor, [tempFile], {
            stdio: 'inherit',
          });

          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Editor exited with code ${code}`));
            }
          });

          child.on('error', (err) => {
            reject(err);
          });
        });

        // Read updated content
        const newContent = fs.readFileSync(tempFile, 'utf-8');

        // Clean up temp file
        fs.unlinkSync(tempFile);

        // Check if content changed
        if (newContent === entry.content) {
          console.log(chalk.dim('No changes made.'));
          return;
        }

        // Update entry
        const spinner = ora('Updating entry...').start();

        const updated = await ctx.entries.update(id, { content: newContent });

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

        const project = await ctx.projects.get(updated.projectId);
        console.log(formatEntryDetails(updated, project?.name));
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

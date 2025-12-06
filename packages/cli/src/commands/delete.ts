import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { withContext } from '../utils/context.js';

interface DeleteOptions {
  force?: boolean;
}

export const deleteCommand = new Command('delete')
  .description('Delete an entry')
  .argument('<id>', 'Entry ID')
  .option('-f, --force', 'Skip confirmation')
  .action(async (id: string, options: DeleteOptions) => {
    try {
      await withContext(async (ctx) => {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          console.error(chalk.red(`Entry "${id}" not found.`));
          process.exit(1);
        }

        const project = await ctx.projects.get(entry.projectId);

        // Confirm deletion
        if (!options.force) {
          console.log(chalk.bold('Entry to delete:'));
          console.log(`  ${chalk.cyan('ID:')}      ${entry.id}`);
          console.log(`  ${chalk.cyan('Title:')}   ${entry.title}`);
          console.log(`  ${chalk.cyan('Project:')} ${project?.name ?? entry.projectId}`);
          console.log('');

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to delete this entry?',
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.dim('Cancelled.'));
            return;
          }
        }

        const spinner = ora('Deleting entry...').start();

        // Remove from vault if enabled
        if (ctx.config.vault?.enabled && project) {
          await ctx.vault.removeEntry(id, project.name);
        }

        // Delete from database
        const deleted = await ctx.entries.delete(id);

        if (deleted) {
          spinner.succeed('Entry deleted.');
        } else {
          spinner.fail('Failed to delete entry.');
          process.exit(1);
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

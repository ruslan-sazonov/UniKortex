import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, setConfigValue } from '@unikortex/core';
import { withContext } from '../utils/context.js';
import { formatProjectsTable, formatProjectDetails } from '../output/table.js';
import { formatProjectsJson, formatProjectNames, formatJson } from '../output/json.js';

export const projectsCommand = new Command('projects')
  .description('Manage projects')
  .action(async () => {
    // Default action: list projects
    try {
      const config = loadConfig();
      await withContext(async (ctx) => {
        const projects = await ctx.projects.list();
        console.log(formatProjectsTable(projects, config.activeProject));
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: list
projectsCommand
  .command('list')
  .description('List all projects')
  .option('--format <format>', 'Output format (table, json, names)', 'table')
  .action(async (options: { format?: string }) => {
    try {
      const config = loadConfig();
      await withContext(async (ctx) => {
        const projects = await ctx.projects.list();

        if (options.format === 'json') {
          console.log(formatProjectsJson(projects, config.activeProject));
        } else if (options.format === 'names') {
          console.log(formatProjectNames(projects));
        } else {
          console.log(formatProjectsTable(projects, config.activeProject));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: create
projectsCommand
  .command('create <name>')
  .description('Create a new project')
  .option('-d, --display-name <name>', 'Display name')
  .option('--description <description>', 'Project description')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(
    async (
      name: string,
      options: { displayName?: string; description?: string; format?: string }
    ) => {
      try {
        await withContext(async (ctx) => {
          const spinner = ora('Creating project...').start();

          const project = await ctx.projects.create({
            name,
            displayName: options.displayName ?? name.charAt(0).toUpperCase() + name.slice(1),
            description: options.description,
          });

          spinner.succeed('Project created!');
          console.log('');

          if (options.format === 'json') {
            console.log(formatJson(project));
          } else {
            console.log(formatProjectDetails(project));
          }
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    }
  );

// Subcommand: show
projectsCommand
  .command('show <name>')
  .description('Show project details')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(async (name: string, options: { format?: string }) => {
    try {
      await withContext(async (ctx) => {
        const project = await ctx.projects.getByName(name);

        if (!project) {
          console.error(chalk.red(`Project "${name}" not found.`));
          process.exit(1);
        }

        const stats = await ctx.projects.getStats(project.id);

        if (options.format === 'json') {
          console.log(formatJson({ ...project, stats }));
        } else {
          console.log(formatProjectDetails(project, stats ?? undefined));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: delete
projectsCommand
  .command('delete <name>')
  .description('Delete a project and all its entries')
  .option('-f, --force', 'Skip confirmation')
  .action(async (name: string, options: { force?: boolean }) => {
    try {
      await withContext(async (ctx) => {
        const project = await ctx.projects.getByName(name);

        if (!project) {
          console.error(chalk.red(`Project "${name}" not found.`));
          process.exit(1);
        }

        const stats = await ctx.projects.getStats(project.id);

        // Confirm deletion
        if (!options.force) {
          console.log(chalk.bold('Project to delete:'));
          console.log(`  ${chalk.cyan('Name:')}    ${project.name}`);
          console.log(`  ${chalk.cyan('Display:')} ${project.displayName}`);
          console.log(`  ${chalk.cyan('Entries:')} ${stats?.totalEntries ?? 0}`);
          console.log('');
          console.log(chalk.yellow('Warning: This will delete all entries in this project!'));
          console.log('');

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to delete this project?',
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.dim('Cancelled.'));
            return;
          }
        }

        const spinner = ora('Deleting project...').start();

        const deleted = await ctx.projects.delete(project.id);

        if (deleted) {
          spinner.succeed('Project deleted.');

          // Clear active project if it was the deleted one
          const config = loadConfig();
          if (config.activeProject === name) {
            setConfigValue('activeProject', undefined);
            console.log(chalk.dim('Active project cleared.'));
          }
        } else {
          spinner.fail('Failed to delete project.');
          process.exit(1);
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: switch (set active project)
projectsCommand
  .command('switch <name>')
  .description('Set the active project for searches and context')
  .action(async (name: string) => {
    try {
      await withContext(async (ctx) => {
        // Verify project exists
        const project = await ctx.projects.getByName(name);

        if (!project) {
          console.error(chalk.red(`Project "${name}" not found.`));
          console.log('');
          console.log(chalk.dim('Available projects:'));
          const projects = await ctx.projects.list();
          projects.forEach((p) => {
            console.log(chalk.dim(`  - ${p.name}`));
          });
          process.exit(1);
        }

        // Update config
        setConfigValue('activeProject', name);

        console.log(chalk.green(`✓ Switched to project: ${chalk.bold(name)}`));
        console.log(chalk.dim('  All searches will now default to this project.'));
        console.log(chalk.dim('  Use --project flag to override, or "projects switch" to change.'));
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: current (show active project)
projectsCommand
  .command('current')
  .description('Show the currently active project')
  .option('--format <format>', 'Output format (table, json, name)', 'table')
  .action(async (options: { format?: string }) => {
    try {
      const config = loadConfig();
      const activeProjectName = config.activeProject;

      if (!activeProjectName) {
        if (options.format === 'json') {
          console.log(JSON.stringify({ activeProject: null }, null, 2));
        } else if (options.format === 'name') {
          // Output nothing for scripting
        } else {
          console.log(chalk.dim('No active project set.'));
          console.log(chalk.dim('Use "unikortex projects switch <name>" to set one.'));
        }
        return;
      }

      await withContext(async (ctx) => {
        const project = await ctx.projects.getByName(activeProjectName);

        if (!project) {
          console.log(chalk.yellow(`⚠ Active project "${activeProjectName}" no longer exists.`));
          console.log(chalk.dim('Use "unikortex projects switch <name>" to set a new one.'));
          return;
        }

        if (options.format === 'json') {
          const stats = await ctx.projects.getStats(project.id);
          console.log(formatJson({ ...project, stats, isActive: true }));
        } else if (options.format === 'name') {
          console.log(project.name);
        } else {
          const stats = await ctx.projects.getStats(project.id);
          console.log(chalk.bold.green(`Active Project: ${project.displayName}`));
          console.log('');
          console.log(formatProjectDetails(project, stats ?? undefined));
        }
      });
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: clear (remove active project)
projectsCommand
  .command('clear')
  .description('Clear the active project (searches will be global)')
  .action(() => {
    try {
      const config = loadConfig();

      if (!config.activeProject) {
        console.log(chalk.dim('No active project is set.'));
        return;
      }

      setConfigValue('activeProject', undefined);
      console.log(chalk.green('✓ Active project cleared.'));
      console.log(chalk.dim('  Searches will now include all projects.'));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

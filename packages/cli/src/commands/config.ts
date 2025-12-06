import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, setConfigValue, getConfigValue, getConfigPath } from '@unikortex/core';
import { formatJson } from '../output/json.js';

export const configCommand = new Command('config')
  .description('View or modify configuration')
  .action(() => {
    // Default action: show current config
    try {
      const config = loadConfig();
      console.log(chalk.bold('Configuration:'));
      console.log(chalk.dim(`Path: ${getConfigPath()}`));
      console.log('');
      console.log(formatJson(config));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: get
configCommand
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    try {
      const value = getConfigValue(key);

      if (value === undefined) {
        console.log(chalk.dim('(not set)'));
      } else if (typeof value === 'object') {
        console.log(formatJson(value));
      } else {
        console.log(String(value));
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: set
configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    try {
      // Try to parse as JSON for complex values
      let parsedValue: unknown = value;

      if (value === 'true') {
        parsedValue = true;
      } else if (value === 'false') {
        parsedValue = false;
      } else if (/^\d+$/.test(value)) {
        parsedValue = parseInt(value, 10);
      } else if (value.startsWith('{') || value.startsWith('[')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      const newConfig = setConfigValue(key, parsedValue);

      console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`));
      console.log('');
      console.log(chalk.dim('New configuration:'));
      console.log(formatJson(newConfig));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: path
configCommand
  .command('path')
  .description('Show the configuration file path')
  .action(() => {
    console.log(getConfigPath());
  });

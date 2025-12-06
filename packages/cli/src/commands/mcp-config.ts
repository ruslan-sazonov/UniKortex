import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as os from 'node:os';

type McpFormat = 'all' | 'claude-desktop' | 'claude-code' | 'gemini-cli' | 'antigravity';

interface McpConfigOptions {
  format?: McpFormat;
}

function getClaudeDesktopConfig(homeDir: string) {
  return {
    mcpServers: {
      unikortex: {
        command: 'unikortex',
        args: ['mcp'],
        env: {
          UNIKORTEX_CONFIG_PATH: path.join(homeDir, '.unikortex', 'config.yaml'),
        },
      },
    },
  };
}

function getGeminiCliConfig() {
  return {
    mcpServers: {
      unikortex: {
        command: 'npx',
        args: ['-y', '@unikortex/cli', 'mcp'],
      },
    },
  };
}

function getAntigravityConfig() {
  return {
    mcpServers: {
      unikortex: {
        command: 'npx',
        args: ['-y', '@unikortex/cli', 'mcp'],
      },
    },
  };
}

function printClaudeDesktop(homeDir: string) {
  console.log(chalk.bold.cyan('━━━ Claude Desktop ━━━'));
  console.log(chalk.dim('Add this to your claude_desktop_config.json:\n'));
  console.log(JSON.stringify(getClaudeDesktopConfig(homeDir), null, 2));
  console.log('');
  console.log(chalk.dim('Config file locations:'));
  console.log(chalk.dim(`  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json`));
  console.log(chalk.dim(`  Windows: %APPDATA%\\Claude\\claude_desktop_config.json`));
  console.log(chalk.dim(`  Linux: ~/.config/Claude/claude_desktop_config.json`));
}

function printClaudeCode() {
  console.log(chalk.bold.cyan('━━━ Claude Code ━━━'));
  console.log(chalk.dim('Run this command to add the MCP server:\n'));
  console.log(chalk.green('claude mcp add --transport stdio unikortex -- npx -y @unikortex/cli mcp'));
  console.log('');
  console.log(chalk.dim('Options:'));
  console.log(chalk.dim('  --scope user     Add to user config (default: local/project)'));
  console.log(chalk.dim('  --scope project  Add to current project only'));
  console.log('');
  console.log(chalk.dim('To verify: claude mcp list'));
}

function printGeminiCli() {
  console.log(chalk.bold.cyan('━━━ Gemini CLI ━━━'));
  console.log(chalk.dim('Add this to your ~/.gemini/settings.json:\n'));
  console.log(JSON.stringify(getGeminiCliConfig(), null, 2));
  console.log('');
  console.log(chalk.dim('Config file location:'));
  console.log(chalk.dim(`  ~/.gemini/settings.json`));
  console.log(chalk.dim('After updating, run: /mcp refresh'));
}

function printAntigravity() {
  console.log(chalk.bold.cyan('━━━ Google Antigravity ━━━'));
  console.log(chalk.dim('Add this to your MCP config:\n'));
  console.log(JSON.stringify(getAntigravityConfig(), null, 2));
  console.log('');
  console.log(chalk.dim('Config file location:'));
  console.log(chalk.dim(`  ~/.gemini/antigravity/mcp_config.json`));
  console.log(chalk.dim('Or: Agent session → "..." → MCP Servers → Manage MCP Servers → View raw config'));
}

export const mcpConfigCommand = new Command('mcp-config')
  .description('Output MCP configuration for AI assistants')
  .option(
    '--format <format>',
    'Config format (all, claude-desktop, claude-code, gemini-cli, antigravity)',
    'all'
  )
  .action((options: McpConfigOptions) => {
    const format = options.format ?? 'all';
    const homeDir = os.homedir();

    if (format === 'all') {
      console.log(chalk.bold('MCP Configuration for UniKortex\n'));

      printClaudeDesktop(homeDir);
      console.log('\n');
      printClaudeCode();
      console.log('\n');
      printGeminiCli();
      console.log('\n');
      printAntigravity();

      console.log('\n');
      console.log(chalk.dim('Tip: Use --format <name> to show only one configuration.'));
    } else if (format === 'claude-desktop') {
      printClaudeDesktop(homeDir);
    } else if (format === 'claude-code') {
      printClaudeCode();
    } else if (format === 'gemini-cli') {
      printGeminiCli();
    } else if (format === 'antigravity') {
      printAntigravity();
    } else {
      console.error(chalk.red(`Unknown format: ${format}`));
      console.error(chalk.dim('Available formats: all, claude-desktop, claude-code, gemini-cli, antigravity'));
      process.exit(1);
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  initializeUniKortex,
  isInitialized,
  SQLiteStorage,
  getDatabasePath,
} from '@unikortex/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the Claude Desktop config file path based on OS
 */
function getClaudeConfigPath(): string | null {
  const homeDir = os.homedir();

  switch (process.platform) {
    case 'darwin':
      return path.join(
        homeDir,
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json'
      );
    case 'win32':
      return path.join(process.env.APPDATA ?? homeDir, 'Claude', 'claude_desktop_config.json');
    case 'linux':
      return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
    default:
      return null;
  }
}

/**
 * Auto-setup MCP configuration for Claude Desktop
 * @param devMode If true, use local node path instead of npx
 */
async function setupClaudeMCP(devMode: boolean = false): Promise<boolean> {
  const configPath = getClaudeConfigPath();
  if (!configPath) return false;

  try {
    // Read existing config or create empty
    let config: { mcpServers?: Record<string, unknown> } = {};

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } else {
      // Create directory if needed
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Add UniKortex MCP server
    config.mcpServers = config.mcpServers ?? {};

    // Determine MCP server config based on mode
    let mcpConfig: { command: string; args: string[] };

    if (devMode) {
      // Development mode: use local node path
      // Find the mcp-stdio package relative to this file (bundled at packages/cli/dist/index.js)
      const candidates = [
        path.resolve(__dirname, '../../mcp-stdio/dist/index.js'),
        path.resolve(__dirname, '../../../mcp-stdio/dist/index.js'),
      ];
      const mcpPath = candidates.find((c) => fs.existsSync(c)) ?? candidates[0]!;
      mcpConfig = {
        command: 'node',
        args: [mcpPath],
      };
    } else {
      // Production mode: use npx
      mcpConfig = {
        command: 'npx',
        args: ['-y', '@unikortex/cli', 'mcp'],
      };
    }

    // Always update config (in case switching between dev/prod)
    config.mcpServers.unikortex = mcpConfig;

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false; // Failed to configure
  }
}

export const initCommand = new Command('init')
  .description('Initialize UniKortex in your home directory')
  .option('--force', 'Reinitialize even if already initialized')
  .option('--dev', 'Development mode: use local paths for MCP (for testing)')
  .action(async (options: { force?: boolean; dev?: boolean }) => {
    const spinner = ora('Initializing UniKortex...').start();

    try {
      if (isInitialized() && !options.force) {
        spinner.info('UniKortex is already initialized.');
        console.log(chalk.dim('Use --force to reinitialize.'));
        return;
      }

      // Create directory structure and config
      const paths = initializeUniKortex();
      spinner.text = 'Creating database...';

      // Initialize database
      const storage = new SQLiteStorage(getDatabasePath());
      await storage.initialize();
      await storage.close();

      spinner.succeed('UniKortex initialized successfully!');
      console.log('');
      console.log(chalk.bold('Created:'));
      console.log(`  ${chalk.cyan('Config:')}   ${paths.config}`);
      console.log(`  ${chalk.cyan('Database:')} ${getDatabasePath()}`);
      console.log(`  ${chalk.cyan('Vault:')}    ${paths.vault}`);

      // Auto-setup MCP for Claude Desktop
      const mcpConfigured = await setupClaudeMCP(options.dev ?? false);

      console.log('');
      console.log(chalk.bold.green('═══ AI Integration Setup ═══'));
      console.log('');

      // Claude Desktop
      console.log(chalk.bold('🤖 Claude Desktop:'));
      if (mcpConfigured) {
        console.log(chalk.green('  ✓ MCP configured automatically'));
        console.log(chalk.dim('    Restart Claude Desktop to enable'));
      } else {
        console.log(chalk.yellow('  ⚠ Run: unikortex mcp-config'));
        console.log(chalk.dim('    Add output to claude_desktop_config.json'));
      }
      console.log('');

      // Claude Code
      console.log(chalk.bold('💻 Claude Code:'));
      console.log(
        chalk.cyan('  claude mcp add --transport stdio unikortex -- npx -y @unikortex/cli mcp')
      );
      console.log(chalk.dim('  Add --scope user for global access'));
      console.log('');

      // ChatGPT
      console.log(chalk.bold('🔮 ChatGPT (Custom GPT):'));
      console.log(chalk.dim('  1. Start local server: unikortex serve'));
      console.log(chalk.dim('  2. Expose with ngrok: ngrok http 3033'));
      console.log(chalk.dim('  3. Create Custom GPT → Actions → Import URL:'));
      console.log(chalk.dim('     https://your-ngrok-url.ngrok.io/openapi.json'));
      console.log('');

      // Gemini
      console.log(chalk.bold('✨ Gemini CLI / Antigravity:'));
      console.log(chalk.dim('  unikortex mcp-config --format gemini-cli'));
      console.log('');

      // Quick start
      console.log(chalk.bold.green('═══ Next Steps ═══'));
      console.log('');
      console.log(chalk.dim('  1. Create a project:'));
      console.log(chalk.cyan('     unikortex projects create my-project'));
      console.log('');
      console.log(chalk.dim('  2. Switch to it:'));
      console.log(chalk.cyan('     unikortex projects switch my-project'));
      console.log('');
      console.log(chalk.dim('  3. Add your first entry:'));
      console.log(chalk.cyan('     unikortex add --type decision'));
      console.log('');
      console.log(chalk.dim('  4. Search your knowledge:'));
      console.log(chalk.cyan('     unikortex search "your query"'));
      console.log('');
      console.log(chalk.dim('  Full documentation: https://github.com/ruslan-sazonov/UniKortex'));
      console.log('');
    } catch (error) {
      spinner.fail('Failed to initialize UniKortex');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

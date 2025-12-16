import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  initializeUniKortex,
  isInitialized,
  SQLiteStorage,
  getDatabasePath,
  setConfigValue,
  SyncManager,
  ManagedSyncService,
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
 * Interactive sync configuration with Pro token
 */
async function configureSyncInteractive(): Promise<boolean> {
  console.log('');
  console.log(chalk.bold.cyan('═══ UniKortex Cloud Sync ═══'));
  console.log('');
  console.log(chalk.dim('Sync your knowledge base across all your devices.'));
  console.log(chalk.dim('Get your Pro token at: ') + chalk.cyan('https://unikortex.io'));
  console.log('');

  const { hasToken } = await inquirer.prompt<{ hasToken: boolean }>([
    {
      type: 'confirm',
      name: 'hasToken',
      message: 'Do you have a UniKortex Pro token?',
      default: false,
    },
  ]);

  if (!hasToken) {
    console.log('');
    console.log(chalk.yellow('No problem! You can configure sync later with:'));
    console.log(chalk.cyan('  unikortex sync login <pro-token>'));
    console.log('');
    return false;
  }

  const { token } = await inquirer.prompt<{ token: string }>([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your Pro token (ukpro_...):',
      mask: '*',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Token is required';
        }
        if (!input.startsWith('ukpro_')) {
          return 'Token must start with "ukpro_"';
        }
        return true;
      },
    },
  ]);

  // Check if service URL is configured
  if (!process.env.UNIKORTEX_SYNC_SERVICE_URL) {
    console.log('');
    console.log(chalk.yellow('Sync service URL not configured.'));
    console.log(chalk.dim('Set UNIKORTEX_SYNC_SERVICE_URL environment variable.'));
    console.log('');
    console.log(chalk.yellow('Token saved but sync will not work until URL is configured.'));

    // Save token anyway for when URL is configured
    setConfigValue('sync', {
      enabled: true,
      proToken: token,
      autoSync: true,
    });
    return false;
  }

  // Validate token with cloud service
  const spinner = ora('Validating Pro token...').start();

  try {
    const syncService = new ManagedSyncService({
      sync: { enabled: true, proToken: token },
    });
    const validation = await syncService.validateToken(token);

    if (!validation.valid) {
      spinner.fail(chalk.red('Invalid token'));
      return false;
    }

    // Save sync configuration
    setConfigValue('sync', {
      enabled: true,
      proToken: token,
      autoSync: true,
    });

    spinner.succeed(chalk.green('Token validated!'));
    console.log('');
    console.log(`  Account: ${chalk.cyan(validation.email)}`);
    console.log(`  Plan:    ${chalk.green(validation.plan)}`);

    // Perform initial sync
    spinner.start('Performing initial sync...');

    const storage = new SQLiteStorage(getDatabasePath());
    await storage.initialize();

    const syncManager = new SyncManager({ storage });
    await syncManager.initialize();

    const result = await syncManager.fullSync();

    await syncManager.close();
    await storage.close();

    spinner.succeed(chalk.green('Initial sync completed!'));

    // Show sync results if anything was synced
    if (result.projectsPulled > 0 || result.entriesPulled > 0) {
      console.log('');
      console.log(chalk.bold('  Pulled from cloud:'));
      console.log(`    Projects: ${result.projectsPulled}`);
      console.log(`    Entries:  ${result.entriesPulled}`);
    }
    if (result.projectsPushed > 0 || result.entriesPushed > 0) {
      console.log('');
      console.log(chalk.bold('  Pushed to cloud:'));
      console.log(`    Projects: ${result.projectsPushed}`);
      console.log(`    Entries:  ${result.entriesPushed}`);
    }

    return true;
  } catch (error) {
    spinner.fail(chalk.red('Failed to configure sync'));
    console.log(chalk.red(`  Error: ${(error as Error).message}`));
    console.log('');
    console.log(chalk.yellow('You can try again later with:'));
    console.log(chalk.cyan('  unikortex sync login <pro-token>'));
    return false;
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
  .option('--local', 'Skip sync setup, use local-only mode')
  .option('--sync', 'Enable sync mode and configure cloud sync')
  .action(async (options: { force?: boolean; dev?: boolean; local?: boolean; sync?: boolean }) => {
    try {
      if (isInitialized() && !options.force) {
        console.log(chalk.yellow('UniKortex is already initialized.'));
        console.log(chalk.dim('Use --force to reinitialize.'));
        return;
      }

      // Show welcome message
      console.log('');
      console.log(chalk.bold.cyan('🧠 Welcome to UniKortex!'));
      console.log(chalk.dim('   Unified Knowledge Base for AI Workflows'));
      console.log('');

      // Determine storage mode
      let setupSync = false;

      if (options.local) {
        // Explicit local mode
        setupSync = false;
        console.log(chalk.dim('Using local-only mode (--local flag)'));
      } else if (options.sync) {
        // Explicit sync mode
        setupSync = true;
      } else {
        // Interactive mode selection
        const { storageMode } = await inquirer.prompt<{ storageMode: 'local' | 'sync' }>([
          {
            type: 'list',
            name: 'storageMode',
            message: 'Choose your storage mode:',
            choices: [
              {
                name: `${chalk.bold('Local only')} - Store data on this device only`,
                value: 'local',
                short: 'Local',
              },
              {
                name: `${chalk.bold('Cloud sync')} - Sync across devices (requires Pro subscription)`,
                value: 'sync',
                short: 'Sync',
              },
            ],
            default: 'local',
          },
        ]);

        setupSync = storageMode === 'sync';
      }

      const spinner = ora('Initializing UniKortex...').start();

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

      // Configure sync if selected
      if (setupSync) {
        console.log('');
        const syncConfigured = await configureSyncInteractive();
        if (syncConfigured) {
          console.log('');
          console.log(chalk.bold.green('═══ Cloud Sync ═══'));
          console.log('');
          console.log(chalk.green('  ✓ Cloud sync configured and connected!'));
          console.log(chalk.dim('  Your knowledge base will sync across devices automatically.'));
          console.log('');
        }
      } else {
        console.log('');
        console.log(chalk.bold('📦 Storage Mode:'));
        console.log(chalk.dim('  Local only - data stored on this device'));
        console.log(chalk.dim('  Enable sync later: unikortex sync login <pro-token>'));
        console.log('');
      }

      // Auto-setup MCP for Claude Desktop
      const mcpConfigured = await setupClaudeMCP(options.dev ?? false);

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
      console.error(chalk.red('Failed to initialize UniKortex'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

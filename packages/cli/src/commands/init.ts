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
 * Show Turso setup instructions
 */
function showTursoInstructions(): void {
  console.log('');
  console.log(chalk.bold.cyan('═══ How to get Turso credentials ═══'));
  console.log('');
  console.log(chalk.bold('1. Sign up at Turso (free):'));
  console.log(chalk.cyan('   https://turso.tech'));
  console.log('');
  console.log(chalk.bold('2. Create a database:'));
  console.log(chalk.dim('   Dashboard → Create Database → Name it "unikortex"'));
  console.log('');
  console.log(chalk.bold('3. Get your database URL:'));
  console.log(chalk.dim('   Click your database → Copy the URL'));
  console.log(chalk.dim('   Example: libsql://unikortex-yourname.turso.io'));
  console.log('');
  console.log(chalk.bold('4. Create an auth token:'));
  console.log(chalk.dim('   Database → Generate Token → Copy the token'));
  console.log('');
  console.log(chalk.dim('Free tier: 9GB storage, 1 billion row reads/month'));
  console.log('');
}

/**
 * Interactive sync configuration
 */
async function configureSyncInteractive(): Promise<boolean> {
  showTursoInstructions();

  const { hasCredentials } = await inquirer.prompt<{ hasCredentials: boolean }>([
    {
      type: 'confirm',
      name: 'hasCredentials',
      message: 'Do you have your Turso database URL and token ready?',
      default: false,
    },
  ]);

  if (!hasCredentials) {
    console.log('');
    console.log(chalk.yellow('No problem! You can configure sync later with:'));
    console.log(chalk.cyan('  unikortex sync setup <url> [token]'));
    console.log('');
    return false;
  }

  const answers = await inquirer.prompt<{ url: string; authToken: string }>([
    {
      type: 'input',
      name: 'url',
      message: 'Turso database URL:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'URL is required';
        }
        if (
          !input.startsWith('libsql://') &&
          !input.startsWith('https://') &&
          !input.startsWith('http://')
        ) {
          return 'URL must start with libsql://, https://, or http://';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'authToken',
      message: 'Auth token (optional for local libsql):',
      mask: '*',
    },
  ]);

  // Save sync configuration as a complete object to avoid partial validation
  const syncConfig: { enabled: boolean; url: string; authToken?: string; autoSync: boolean } = {
    enabled: true,
    url: answers.url,
    autoSync: true,
  };
  if (answers.authToken) {
    syncConfig.authToken = answers.authToken;
  }
  setConfigValue('sync', syncConfig);

  // Test the connection and perform initial sync
  const spinner = ora('Testing connection to Turso...').start();

  try {
    const storage = new SQLiteStorage(getDatabasePath());
    await storage.initialize();

    const syncManager = new SyncManager({ storage });
    await syncManager.initialize();

    spinner.text = 'Syncing with remote database...';
    const result = await syncManager.fullSync();

    await syncManager.close();
    await storage.close();

    spinner.succeed(chalk.green('Connected to Turso and synced successfully!'));

    // Show sync results if anything was synced
    if (result.projectsPulled > 0 || result.entriesPulled > 0) {
      console.log('');
      console.log(chalk.bold('  Pulled from remote:'));
      console.log(`    Projects: ${result.projectsPulled}`);
      console.log(`    Entries:  ${result.entriesPulled}`);
    }
    if (result.projectsPushed > 0 || result.entriesPushed > 0) {
      console.log('');
      console.log(chalk.bold('  Pushed to remote:'));
      console.log(`    Projects: ${result.projectsPushed}`);
      console.log(`    Entries:  ${result.entriesPushed}`);
    }

    return true;
  } catch (error) {
    spinner.fail(chalk.red('Failed to connect to Turso'));
    console.log(chalk.red(`  Error: ${(error as Error).message}`));
    console.log('');
    console.log(chalk.yellow('Sync configuration saved but connection failed.'));
    console.log(chalk.dim('Check your credentials and try: unikortex sync'));
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
  .option('--sync', 'Enable sync mode and configure Turso')
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
                name: `${chalk.bold('Multi-device sync')} - Sync across devices using Turso (free cloud database)`,
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
          console.log(chalk.bold.green('═══ Multi-Device Sync ═══'));
          console.log('');
          console.log(chalk.green('  ✓ Sync configured and connected!'));
          console.log(chalk.dim('  Your knowledge base will sync across devices automatically.'));
          console.log('');
        }
      } else {
        console.log('');
        console.log(chalk.bold('📦 Storage Mode:'));
        console.log(chalk.dim('  Local only - data stored on this device'));
        console.log(chalk.dim('  Enable sync later: unikortex sync setup <url>'));
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

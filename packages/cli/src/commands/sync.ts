import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadConfig,
  setConfigValue,
  SQLiteStorage,
  EmbeddingService,
  VectorStore,
  SyncManager,
  isInitialized,
} from '@unikortex/core';

export const syncCommand = new Command('sync')
  .description('Sync knowledge base with remote Turso database')
  .action(async () => {
    // Default action: show sync status and perform sync if enabled
    try {
      if (!isInitialized()) {
        console.error(chalk.red('UniKortex is not initialized. Run "unikortex init" first.'));
        process.exit(1);
      }

      const config = loadConfig();

      if (!config.sync?.enabled || !config.sync?.url) {
        console.log(chalk.yellow('Remote sync is not configured.'));
        console.log('');
        console.log('To enable sync, run:');
        console.log(chalk.cyan('  unikortex sync setup <turso-url> [auth-token]'));
        console.log('');
        console.log('Example:');
        console.log(
          chalk.dim('  unikortex sync setup libsql://my-db-myorg.turso.io my-auth-token')
        );
        return;
      }

      // Initialize storage and sync manager
      const storage = new SQLiteStorage();
      await storage.initialize();

      let embeddingService: EmbeddingService | undefined;
      let vectorStore: VectorStore | undefined;

      try {
        embeddingService = new EmbeddingService(config.embeddings);
        await embeddingService.initialize();

        const db = (storage as unknown as { db: unknown }).db;
        vectorStore = new VectorStore(
          db as ConstructorParameters<typeof VectorStore>[0],
          embeddingService.dimensions
        );
        await vectorStore.initialize();
      } catch {
        // Embedding service not available
      }

      const syncManager = new SyncManager({
        storage,
        embeddingService,
        vectorStore,
        config,
      });

      const spinner = ora('Syncing with remote database...').start();

      try {
        await syncManager.initialize();
        const result = await syncManager.fullSync();

        spinner.succeed(chalk.green('Sync completed successfully!'));
        console.log('');
        console.log(`  Projects synced: ${result.projectsPulled}`);
        console.log(`  Entries synced:  ${result.entriesPulled}`);
        console.log(`  Entries indexed: ${result.entriesIndexed}`);
      } catch (error) {
        spinner.fail(chalk.red('Sync failed'));
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      } finally {
        await syncManager.close();
        await storage.close();
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: setup
syncCommand
  .command('setup <url> [authToken]')
  .description('Configure remote Turso database for sync')
  .option('--no-auto-sync', 'Disable automatic sync on read/write')
  .action(async (url: string, authToken?: string, options?: { autoSync?: boolean }) => {
    try {
      // Validate URL format
      if (
        !url.startsWith('libsql://') &&
        !url.startsWith('https://') &&
        !url.startsWith('http://')
      ) {
        console.error(chalk.red('Invalid URL. Must start with libsql://, https://, or http://'));
        process.exit(1);
      }

      // Configure sync settings as a complete object to avoid partial validation
      const syncConfig: { enabled: boolean; url: string; authToken?: string; autoSync: boolean } = {
        enabled: true,
        url,
        autoSync: options?.autoSync !== false,
      };
      if (authToken) {
        syncConfig.authToken = authToken;
      }
      setConfigValue('sync', syncConfig);

      console.log(chalk.green('✓ Sync configured successfully!'));
      console.log('');
      console.log(`  URL: ${chalk.cyan(url)}`);
      console.log(`  Auth: ${authToken ? chalk.dim('***') : chalk.dim('(none)')}`);
      console.log(
        `  Auto-sync: ${options?.autoSync !== false ? chalk.green('enabled') : chalk.yellow('disabled')}`
      );
      console.log('');
      console.log('Run ' + chalk.cyan('unikortex sync') + ' to sync now.');
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: status
syncCommand
  .command('status')
  .description('Show sync status')
  .action(async () => {
    try {
      if (!isInitialized()) {
        console.error(chalk.red('UniKortex is not initialized. Run "unikortex init" first.'));
        process.exit(1);
      }

      const config = loadConfig();

      console.log(chalk.bold('Sync Status:'));
      console.log('');

      if (!config.sync?.enabled || !config.sync?.url) {
        console.log(`  Enabled: ${chalk.red('No')}`);
        console.log('');
        console.log(chalk.dim('Run "unikortex sync setup <url>" to configure sync.'));
        return;
      }

      console.log(`  Enabled:   ${chalk.green('Yes')}`);
      console.log(`  URL:       ${chalk.cyan(config.sync.url)}`);
      console.log(
        `  Auth:      ${config.sync.authToken ? chalk.dim('configured') : chalk.dim('(none)')}`
      );
      console.log(
        `  Auto-sync: ${config.sync.autoSync !== false ? chalk.green('Yes') : chalk.yellow('No')}`
      );

      // Try to get last sync info
      const storage = new SQLiteStorage();
      await storage.initialize();

      const syncManager = new SyncManager({
        storage,
        config,
      });

      try {
        const status = syncManager.getSyncStatus();
        console.log(
          `  Last sync: ${status.lastSyncAt ? status.lastSyncAt.toISOString() : chalk.dim('Never')}`
        );
        console.log(`  Device ID: ${chalk.dim(status.deviceId)}`);
      } catch {
        console.log(`  Last sync: ${chalk.dim('Unknown')}`);
      }

      await storage.close();
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: disable
syncCommand
  .command('disable')
  .description('Disable remote sync')
  .action(() => {
    try {
      setConfigValue('sync.enabled', false);
      console.log(chalk.green('✓ Sync disabled.'));
      console.log(chalk.dim('Your data will only be stored locally.'));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: enable
syncCommand
  .command('enable')
  .description('Enable remote sync (requires previous setup)')
  .action(() => {
    try {
      const config = loadConfig();

      if (!config.sync?.url) {
        console.error(
          chalk.red('Sync URL not configured. Run "unikortex sync setup <url>" first.')
        );
        process.exit(1);
      }

      setConfigValue('sync.enabled', true);
      console.log(chalk.green('✓ Sync enabled.'));
      console.log(`  URL: ${chalk.cyan(config.sync.url)}`);
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

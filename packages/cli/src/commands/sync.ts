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
  ManagedSyncService,
  isInitialized,
} from '@unikortex/core';

export const syncCommand = new Command('sync')
  .description('Sync knowledge base with UniKortex Cloud')
  .action(async () => {
    // Default action: show sync status and perform sync if enabled
    try {
      if (!isInitialized()) {
        console.error(chalk.red('UniKortex is not initialized. Run "unikortex init" first.'));
        process.exit(1);
      }

      const config = loadConfig();

      if (!config.sync?.enabled || !config.sync?.proToken) {
        console.log(chalk.yellow('Cloud sync is not configured.'));
        console.log('');
        console.log('To enable sync, run:');
        console.log(chalk.cyan('  unikortex sync login <pro-token>'));
        console.log('');
        console.log('Get your Pro token at ' + chalk.cyan('https://unikortex.io'));
        return;
      }

      if (!process.env.UNIKORTEX_SYNC_SERVICE_URL) {
        console.error(chalk.red('Sync service URL not configured.'));
        console.error(chalk.dim('Set UNIKORTEX_SYNC_SERVICE_URL environment variable.'));
        process.exit(1);
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

      const spinner = ora('Syncing with UniKortex Cloud...').start();

      try {
        await syncManager.initialize();
        const result = await syncManager.fullSync();

        spinner.succeed(chalk.green('Sync completed successfully!'));
        console.log('');
        console.log(chalk.bold('  Pulled from cloud:'));
        console.log(`    Projects: ${result.projectsPulled}`);
        console.log(`    Entries:  ${result.entriesPulled}`);
        console.log('');
        console.log(chalk.bold('  Pushed to cloud:'));
        console.log(`    Projects: ${result.projectsPushed}`);
        console.log(`    Entries:  ${result.entriesPushed}`);
        if (result.entriesIndexed > 0) {
          console.log('');
          console.log(`  Entries indexed: ${result.entriesIndexed}`);
        }
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

// Subcommand: login
syncCommand
  .command('login <token>')
  .description('Login with your UniKortex Pro token')
  .action(async (token: string) => {
    try {
      // Validate token format
      if (!token.startsWith('ukpro_')) {
        console.error(chalk.red('Invalid token format. Pro tokens start with "ukpro_"'));
        process.exit(1);
      }

      if (!process.env.UNIKORTEX_SYNC_SERVICE_URL) {
        console.error(chalk.red('Sync service URL not configured.'));
        console.error(chalk.dim('Set UNIKORTEX_SYNC_SERVICE_URL environment variable.'));
        process.exit(1);
      }

      const spinner = ora('Validating token...').start();

      try {
        // Validate token with cloud service
        const syncService = new ManagedSyncService({
          sync: { enabled: true, proToken: token },
        });
        const validation = await syncService.validateToken(token);

        if (!validation.valid) {
          spinner.fail(chalk.red('Invalid token'));
          process.exit(1);
        }

        // Save token to config
        setConfigValue('sync', {
          enabled: true,
          proToken: token,
          autoSync: true,
        });

        spinner.succeed(chalk.green('Logged in successfully!'));
        console.log('');
        console.log(`  Account: ${chalk.cyan(validation.email)}`);
        console.log(`  Plan:    ${chalk.green(validation.plan)}`);
        console.log('');
        console.log('Run ' + chalk.cyan('unikortex sync') + ' to sync now.');
      } catch (error) {
        spinner.fail(chalk.red('Login failed'));
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: logout
syncCommand
  .command('logout')
  .description('Logout from UniKortex Cloud (keeps local data)')
  .action(() => {
    try {
      const config = loadConfig();

      if (!config.sync?.proToken) {
        console.log(chalk.yellow('Not logged in.'));
        return;
      }

      // Remove token but keep sync config structure
      setConfigValue('sync', {
        enabled: false,
        autoSync: true,
      });

      console.log(chalk.green('✓ Logged out successfully.'));
      console.log(chalk.dim('Your local data has been preserved.'));
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

      if (!config.sync?.enabled || !config.sync?.proToken) {
        console.log(`  Logged in:  ${chalk.red('No')}`);
        console.log('');
        console.log(chalk.dim('Run "unikortex sync login <token>" to enable cloud sync.'));
        console.log(chalk.dim('Get your Pro token at https://unikortex.io'));
        return;
      }

      console.log(`  Logged in:  ${chalk.green('Yes')}`);
      console.log(`  Token:      ${chalk.dim(config.sync.proToken.slice(0, 12) + '...')}`);
      console.log(
        `  Auto-sync:  ${config.sync.autoSync !== false ? chalk.green('Yes') : chalk.yellow('No')}`
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
          `  Last sync:  ${status.lastSyncAt ? status.lastSyncAt.toISOString() : chalk.dim('Never')}`
        );
        console.log(`  Device ID:  ${chalk.dim(status.deviceId)}`);
      } catch {
        console.log(`  Last sync:  ${chalk.dim('Unknown')}`);
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
  .description('Disable cloud sync (keeps credentials)')
  .action(() => {
    try {
      setConfigValue('sync.enabled', false);
      console.log(chalk.green('✓ Sync disabled.'));
      console.log(chalk.dim('Your data will only be stored locally.'));
      console.log(chalk.dim('Run "unikortex sync enable" to re-enable.'));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

// Subcommand: enable
syncCommand
  .command('enable')
  .description('Enable cloud sync (requires login)')
  .action(() => {
    try {
      const config = loadConfig();

      if (!config.sync?.proToken) {
        console.error(chalk.red('Not logged in. Run "unikortex sync login <token>" first.'));
        process.exit(1);
      }

      setConfigValue('sync.enabled', true);
      console.log(chalk.green('✓ Sync enabled.'));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

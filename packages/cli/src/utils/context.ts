import {
  SQLiteStorage,
  EntryService,
  ProjectService,
  RelationService,
  VaultSyncService,
  loadConfig,
  isInitialized,
  type Config,
} from '@unikortex/core';

/**
 * Application context containing all services
 */
export interface AppContext {
  config: Config;
  storage: SQLiteStorage;
  entries: EntryService;
  projects: ProjectService;
  relations: RelationService;
  vault: VaultSyncService;
}

let context: AppContext | null = null;

/**
 * Initialize and get the application context
 * Ensures services are only created once
 */
export async function getContext(): Promise<AppContext> {
  if (context) {
    return context;
  }

  if (!isInitialized()) {
    throw new Error('UniKortex is not initialized. Run "unikortex init" first.');
  }

  const config = loadConfig();
  const storage = new SQLiteStorage();
  await storage.initialize();

  context = {
    config,
    storage,
    entries: new EntryService(storage),
    projects: new ProjectService(storage),
    relations: new RelationService(storage),
    vault: new VaultSyncService(storage, config),
  };

  return context;
}

/**
 * Close the application context
 */
export async function closeContext(): Promise<void> {
  if (context) {
    await context.storage.close();
    context = null;
  }
}

/**
 * Run an async command with proper context management
 */
export async function withContext<T>(fn: (ctx: AppContext) => Promise<T>): Promise<T> {
  try {
    const ctx = await getContext();
    return await fn(ctx);
  } finally {
    await closeContext();
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Config, ConfigSchema } from '../types.js';

const UNIKORTEX_DIR_NAME = '.unikortex';
const CONFIG_FILE_NAME = 'config.yaml';
const DATABASE_FILE_NAME = 'unikortex.db';
const VAULT_DIR_NAME = 'vault';

/**
 * Get the UniKortex home directory path
 * Defaults to ~/.unikortex but can be overridden with UNIKORTEX_HOME env var
 */
export function getUniKortexHome(): string {
  const envHome = process.env['UNIKORTEX_HOME'];
  if (envHome) {
    return envHome;
  }
  return path.join(os.homedir(), UNIKORTEX_DIR_NAME);
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  const envPath = process.env['UNIKORTEX_CONFIG_PATH'];
  if (envPath) {
    return envPath;
  }
  return path.join(getUniKortexHome(), CONFIG_FILE_NAME);
}

/**
 * Get the path to the SQLite database
 */
export function getDatabasePath(): string {
  return path.join(getUniKortexHome(), DATABASE_FILE_NAME);
}

/**
 * Get the path to the vault directory
 */
export function getVaultPath(config?: Config): string {
  if (config?.vault?.path) {
    // Expand ~ to home directory
    if (config.vault.path.startsWith('~')) {
      return path.join(os.homedir(), config.vault.path.slice(1));
    }
    return config.vault.path;
  }
  return path.join(getUniKortexHome(), VAULT_DIR_NAME);
}

/**
 * Check if UniKortex has been initialized
 */
export function isInitialized(): boolean {
  const home = getUniKortexHome();
  const configPath = getConfigPath();
  const dbPath = getDatabasePath();

  return fs.existsSync(home) && fs.existsSync(configPath) && fs.existsSync(dbPath);
}

/**
 * Load the config file
 * Returns default config if file doesn't exist
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return getDefaultConfig();
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(content);
    const validated = ConfigSchema.parse(parsed);
    return validated;
  } catch {
    // If config is invalid, return default
    console.warn(`Warning: Invalid config file at ${configPath}, using defaults`);
    return getDefaultConfig();
  }
}

/**
 * Save the config file
 */
export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const home = getUniKortexHome();

  // Ensure directory exists
  if (!fs.existsSync(home)) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  }

  const content = stringifyYaml(config);
  fs.writeFileSync(configPath, content, { mode: 0o600 });
}

/**
 * Get the default configuration
 */
export function getDefaultConfig(): Config {
  return {
    mode: 'personal',
    embeddings: {
      provider: 'auto',
    },
    vault: {
      enabled: true,
      syncOnChange: true,
    },
    output: {
      defaultFormat: 'table',
      colors: true,
    },
  };
}

/**
 * Initialize the UniKortex directory structure
 */
export function initializeUniKortex(): { home: string; config: string; vault: string } {
  const home = getUniKortexHome();
  const configPath = getConfigPath();
  const vaultPath = getVaultPath();

  // Create directories with secure permissions
  if (!fs.existsSync(home)) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  }

  if (!fs.existsSync(vaultPath)) {
    fs.mkdirSync(vaultPath, { recursive: true, mode: 0o700 });
  }

  // Create default config if it doesn't exist
  if (!fs.existsSync(configPath)) {
    saveConfig(getDefaultConfig());
  }

  return { home, config: configPath, vault: vaultPath };
}

/**
 * Update a specific config value using dot notation
 * e.g., setConfigValue('embeddings.provider', 'openai')
 */
export function setConfigValue(key: string, value: unknown): Config {
  const config = loadConfig();
  const keys = key.split('.');

  // Navigate to the nested property
  let current: Record<string, unknown> = config as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (k === undefined) continue;
    if (current[k] === undefined) {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }

  // Set the value
  const lastKey = keys[keys.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }

  // Validate and save
  const validated = ConfigSchema.parse(config);
  saveConfig(validated);

  return validated;
}

/**
 * Get a specific config value using dot notation
 */
export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const keys = key.split('.');

  let current: unknown = config;
  for (const k of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }

  return current;
}

import type { Entry, Project, EntryRelation, Config } from '../types.js';
import { loadConfig, getUniKortexHome } from '../utils/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SYNC_STATE_FILE = 'sync-state.json';

interface SyncState {
  lastSyncAt: string | null; // ISO timestamp of last successful sync
  deviceId: string; // Unique device identifier
}

/**
 * Entry tag structure for sync payload
 */
export interface EntryTag {
  entryId: string;
  tag: string;
}

/**
 * Payload sent to and received from the sync service
 */
export interface SyncPayload {
  projects: Project[];
  entries: Entry[];
  relations: EntryRelation[];
  tags: EntryTag[];
  lastSyncAt: string | null;
}

/**
 * Token validation response from the sync service
 */
export interface TokenValidationResponse {
  valid: boolean;
  email: string;
  plan: string;
}

/**
 * Service for syncing data with the UniKortex managed cloud service.
 *
 * Architecture:
 * - CLI sends local data to cloud service via HTTP
 * - Cloud service merges with user's data (stored in Turso - hidden from user)
 * - Cloud service returns merged data to CLI
 * - CLI applies merged data to local SQLite
 *
 * This replaces direct Turso access - users never see or configure Turso.
 */
export class ManagedSyncService {
  private config: Config;
  private syncState: SyncState;
  private serviceUrl: string;
  private proToken: string;

  constructor(config?: Config) {
    this.config = config ?? loadConfig();
    this.syncState = this.loadSyncState();
    this.serviceUrl = process.env.UNIKORTEX_SYNC_SERVICE_URL ?? '';
    this.proToken = this.config.sync?.proToken ?? '';
  }

  /**
   * Check if sync is enabled (service URL and Pro token configured)
   */
  isEnabled(): boolean {
    return !!this.serviceUrl && !!this.proToken;
  }

  /**
   * Initialize the sync service (validates configuration)
   */
  async initialize(): Promise<void> {
    if (!this.serviceUrl) {
      throw new Error(
        'Sync service URL not configured. Set UNIKORTEX_SYNC_SERVICE_URL environment variable.'
      );
    }
    if (!this.proToken) {
      throw new Error('Sync requires a Pro subscription. Run: unikortex sync login <token>');
    }
    if (!this.proToken.startsWith('ukpro_')) {
      throw new Error('Invalid token format. Pro tokens start with "ukpro_"');
    }
  }

  /**
   * Close the service (no-op for HTTP client, but maintains interface compatibility)
   */
  async close(): Promise<void> {
    // No persistent connection to close
  }

  /**
   * Perform a full bidirectional sync with the cloud service.
   *
   * Flow:
   * 1. Send local data to cloud service
   * 2. Cloud service merges with remote data (newer wins by updatedAt)
   * 3. Cloud service returns merged data
   * 4. Caller applies merged data to local storage
   */
  async fullSync(localData: SyncPayload): Promise<SyncPayload> {
    await this.initialize();

    const response = await fetch(`${this.serviceUrl}/api/v1/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.proToken}`,
        'Content-Type': 'application/json',
        'X-Device-Id': this.syncState.deviceId,
      },
      body: JSON.stringify(localData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid Pro token. Check your subscription status.');
      }
      if (response.status === 403) {
        throw new Error('Pro subscription expired or inactive. Please renew at unikortex.io');
      }
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Sync service error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as SyncPayload;

    // Update sync state on success
    this.updateSyncState();

    return result;
  }

  /**
   * Validate a Pro token with the cloud service.
   * Used by `sync login` command to verify token before saving.
   */
  async validateToken(token?: string): Promise<TokenValidationResponse> {
    const tokenToValidate = token ?? this.proToken;

    if (!tokenToValidate) {
      throw new Error('No token provided');
    }

    if (!tokenToValidate.startsWith('ukpro_')) {
      throw new Error('Invalid token format. Pro tokens start with "ukpro_"');
    }

    if (!this.serviceUrl) {
      throw new Error(
        'Sync service URL not configured. Set UNIKORTEX_SYNC_SERVICE_URL environment variable.'
      );
    }

    const response = await fetch(`${this.serviceUrl}/api/v1/sync/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenToValidate}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid token');
      }
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Token validation failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as TokenValidationResponse;
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncAt(): Date | null {
    return this.syncState.lastSyncAt ? new Date(this.syncState.lastSyncAt) : null;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.syncState.deviceId;
  }

  // === Private Helpers ===

  private loadSyncState(): SyncState {
    const statePath = path.join(getUniKortexHome(), SYNC_STATE_FILE);

    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        return JSON.parse(content) as SyncState;
      } catch {
        // Corrupted state, reset
      }
    }

    // Generate new device ID
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const state: SyncState = {
      lastSyncAt: null,
      deviceId,
    };
    this.saveSyncState(state);
    return state;
  }

  private saveSyncState(state: SyncState): void {
    const statePath = path.join(getUniKortexHome(), SYNC_STATE_FILE);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  private updateSyncState(): void {
    this.syncState.lastSyncAt = new Date().toISOString();
    this.saveSyncState(this.syncState);
  }
}

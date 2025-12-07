import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SyncManager } from './manager.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import type { Config } from '../types.js';

// Mock the TursoSyncService since we don't want to connect to a real database
vi.mock('./turso.js', () => {
  return {
    TursoSyncService: vi.fn().mockImplementation(() => ({
      isEnabled: vi.fn().mockReturnValue(false),
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      pullAll: vi.fn().mockResolvedValue({ projects: [], entries: [], relations: [] }),
      pushProject: vi.fn().mockResolvedValue(undefined),
      pushEntry: vi.fn().mockResolvedValue(undefined),
      pushRelation: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      deleteRelation: vi.fn().mockResolvedValue(undefined),
      getLastSyncAt: vi.fn().mockReturnValue(null),
      getDeviceId: vi.fn().mockReturnValue('test-device-id'),
    })),
  };
});

describe('SyncManager', () => {
  let storage: SQLiteStorage;
  let tempDbPath: string;
  let syncManager: SyncManager;

  const disabledConfig: Config = {
    database: { path: '' },
    embeddings: { provider: 'local' },
  };

  beforeEach(async () => {
    // Create a temporary database file
    tempDbPath = path.join(os.tmpdir(), `unikortex-sync-test-${Date.now()}.db`);
    storage = new SQLiteStorage(tempDbPath);
    await storage.initialize();

    syncManager = new SyncManager({
      storage,
      config: disabledConfig,
    });
  });

  afterEach(async () => {
    await syncManager.close();
    await storage.close();
    // Clean up temp file
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return false when sync is not configured', () => {
      expect(syncManager.isEnabled()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize without error when sync is disabled', async () => {
      await expect(syncManager.initialize()).resolves.not.toThrow();
    });

    it('should only initialize once', async () => {
      await syncManager.initialize();
      await syncManager.initialize();
      // Should not throw
    });
  });

  describe('fullSync', () => {
    it('should return zeros when sync is disabled', async () => {
      const result = await syncManager.fullSync();
      expect(result).toEqual({
        entriesPulled: 0,
        entriesPushed: 0,
        projectsPulled: 0,
        projectsPushed: 0,
        entriesIndexed: 0,
      });
    });
  });

  describe('pullChanges', () => {
    it('should not throw when sync is disabled', async () => {
      await expect(syncManager.pullChanges()).resolves.not.toThrow();
    });
  });

  describe('pushProject', () => {
    it('should not throw when sync is disabled', async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      await expect(syncManager.pushProject(project)).resolves.not.toThrow();
    });
  });

  describe('pushEntry', () => {
    it('should not throw when sync is disabled', async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      const entry = await storage.createEntry({
        projectId: project.id,
        title: 'Test Entry',
        type: 'note',
        content: 'Test content',
      });
      await expect(syncManager.pushEntry(entry)).resolves.not.toThrow();
    });
  });

  describe('pushRelation', () => {
    it('should not throw when sync is disabled', async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      const entry1 = await storage.createEntry({
        projectId: project.id,
        title: 'Entry 1',
        type: 'note',
        content: 'Content 1',
      });
      const entry2 = await storage.createEntry({
        projectId: project.id,
        title: 'Entry 2',
        type: 'note',
        content: 'Content 2',
      });
      const relation = await storage.createRelation({
        fromId: entry1.id,
        toId: entry2.id,
        relationType: 'related',
      });
      await expect(syncManager.pushRelation(relation)).resolves.not.toThrow();
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', () => {
      const status = syncManager.getSyncStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('lastSyncAt');
      expect(status).toHaveProperty('deviceId');
    });
  });

  describe('close', () => {
    it('should close without error', async () => {
      await syncManager.initialize();
      await expect(syncManager.close()).resolves.not.toThrow();
    });
  });
});

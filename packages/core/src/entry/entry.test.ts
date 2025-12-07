import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EntryService } from './entry.js';
import { SQLiteStorage } from '../storage/sqlite.js';

describe('EntryService', () => {
  let storage: SQLiteStorage;
  let entryService: EntryService;
  let tempDbPath: string;
  let projectId: string;

  beforeEach(async () => {
    tempDbPath = path.join(os.tmpdir(), `unikortex-entry-test-${Date.now()}.db`);
    storage = new SQLiteStorage(tempDbPath);
    await storage.initialize();
    entryService = new EntryService(storage);

    // Create a project for entries
    const project = await storage.createProject({
      name: 'test-project',
      displayName: 'Test Project',
    });
    projectId = project.id;
  });

  afterEach(async () => {
    await storage.close();
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('create', () => {
    it('should create an entry with required fields', async () => {
      const entry = await entryService.create({
        projectId,
        title: 'Test Entry',
        type: 'note',
        content: 'This is test content',
      });

      expect(entry.id).toBeDefined();
      expect(entry.title).toBe('Test Entry');
      expect(entry.type).toBe('note');
      expect(entry.content).toBe('This is test content');
      expect(entry.status).toBe('active');
    });

    it('should create an entry with all fields', async () => {
      const entry = await entryService.create({
        projectId,
        title: 'Full Entry',
        type: 'decision',
        content: 'Decision content',
        status: 'draft',
        tags: ['test', 'decision'],
        contextSummary: 'Custom summary',
      });

      expect(entry.type).toBe('decision');
      expect(entry.status).toBe('draft');
      expect(entry.tags).toEqual(['test', 'decision']);
      expect(entry.contextSummary).toBe('Custom summary');
    });

    it('should auto-generate context summary if not provided', async () => {
      const entry = await entryService.create({
        projectId,
        title: 'Auto Summary Test',
        type: 'decision',
        content: 'We decided to use TypeScript for better type safety.',
      });

      expect(entry.contextSummary).toBeDefined();
      expect(entry.contextSummary?.length).toBeGreaterThan(0);
    });

    it('should reject invalid entry type', async () => {
      await expect(
        entryService.create({
          projectId,
          title: 'Invalid Type',
          type: 'invalid' as never,
          content: 'Content',
        })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get an existing entry', async () => {
      const created = await entryService.create({
        projectId,
        title: 'Get Test',
        type: 'note',
        content: 'Content',
      });

      const retrieved = await entryService.get(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Get Test');
    });

    it('should return null for non-existent entry', async () => {
      const result = await entryService.get('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update entry fields', async () => {
      const created = await entryService.create({
        projectId,
        title: 'Original Title',
        type: 'note',
        content: 'Original content',
      });

      const updated = await entryService.update(created.id, {
        title: 'Updated Title',
        content: 'Updated content',
      });

      expect(updated?.title).toBe('Updated Title');
      expect(updated?.content).toBe('Updated content');
    });

    it('should update entry status', async () => {
      const created = await entryService.create({
        projectId,
        title: 'Status Test',
        type: 'decision',
        content: 'Content',
      });

      const updated = await entryService.update(created.id, {
        status: 'archived',
      });

      expect(updated?.status).toBe('archived');
    });

    it('should return null when updating non-existent entry', async () => {
      const result = await entryService.update('non-existent', {
        title: 'New Title',
      });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing entry', async () => {
      const created = await entryService.create({
        projectId,
        title: 'Delete Test',
        type: 'note',
        content: 'Content',
      });

      const deleted = await entryService.delete(created.id);
      expect(deleted).toBe(true);

      const retrieved = await entryService.get(created.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent entry', async () => {
      const deleted = await entryService.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await entryService.create({
        projectId,
        title: 'Decision 1',
        type: 'decision',
        content: 'Content 1',
      });
      await entryService.create({
        projectId,
        title: 'Note 1',
        type: 'note',
        content: 'Content 2',
      });
      await entryService.create({
        projectId,
        title: 'Research 1',
        type: 'research',
        content: 'Content 3',
      });
    });

    it('should list all entries', async () => {
      const result = await entryService.list();
      expect(result.items.length).toBe(3);
    });

    it('should filter by type', async () => {
      const result = await entryService.list({ type: ['decision'] });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.type).toBe('decision');
    });

    it('should filter by project', async () => {
      const result = await entryService.list({ projectId });
      expect(result.items.length).toBe(3);
    });

    it('should paginate results', async () => {
      const result = await entryService.list({ limit: 2 });
      expect(result.items.length).toBe(2);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await entryService.create({
        projectId,
        title: 'TypeScript Decision',
        type: 'decision',
        content: 'We chose TypeScript for type safety.',
      });
      await entryService.create({
        projectId,
        title: 'Database Architecture',
        type: 'decision',
        content: 'We use PostgreSQL for relational data.',
      });
    });

    it('should search by title', async () => {
      const result = await entryService.search('TypeScript');
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.title).toContain('TypeScript');
    });

    it('should search by content', async () => {
      const result = await entryService.search('PostgreSQL');
      expect(result.items.length).toBe(1);
    });

    it('should return empty for no matches', async () => {
      const result = await entryService.search('nonexistent');
      expect(result.items.length).toBe(0);
    });
  });

  describe('tags', () => {
    it('should get tags for an entry', async () => {
      const entry = await entryService.create({
        projectId,
        title: 'Tagged Entry',
        type: 'note',
        content: 'Content',
        tags: ['tag1', 'tag2'],
      });

      const tags = await entryService.getTags(entry.id);
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2');
    });

    it('should set tags for an entry', async () => {
      const entry = await entryService.create({
        projectId,
        title: 'Tag Update Test',
        type: 'note',
        content: 'Content',
      });

      await entryService.setTags(entry.id, ['new-tag-1', 'new-tag-2']);
      const tags = await entryService.getTags(entry.id);
      expect(tags).toContain('new-tag-1');
      expect(tags).toContain('new-tag-2');
    });

    it('should get all unique tags', async () => {
      await entryService.create({
        projectId,
        title: 'Entry 1',
        type: 'note',
        content: 'Content',
        tags: ['shared', 'unique1'],
      });
      await entryService.create({
        projectId,
        title: 'Entry 2',
        type: 'note',
        content: 'Content',
        tags: ['shared', 'unique2'],
      });

      const allTags = await entryService.getAllTags();
      expect(allTags).toContain('shared');
      expect(allTags).toContain('unique1');
      expect(allTags).toContain('unique2');
    });
  });

  describe('validate', () => {
    it('should throw for invalid entry', () => {
      expect(() => entryService.validate({ invalid: 'data' })).toThrow();
    });
  });
});

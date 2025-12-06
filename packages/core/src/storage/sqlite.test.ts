import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SQLiteStorage } from './sqlite.js';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create a temporary database file
    tempDbPath = path.join(os.tmpdir(), `unikortex-test-${Date.now()}.db`);
    storage = new SQLiteStorage(tempDbPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    // Clean up temp file
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Projects', () => {
    it('should create a project', async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
        description: 'A test project',
      });

      expect(project.name).toBe('test-project');
      expect(project.displayName).toBe('Test Project');
      expect(project.description).toBe('A test project');
      expect(project.id).toBeDefined();
    });

    it('should get a project by id', async () => {
      const created = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });

      const retrieved = await storage.getProject(created.id);
      expect(retrieved?.name).toBe('test-project');
    });

    it('should get a project by name', async () => {
      await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });

      const retrieved = await storage.getProjectByName('test-project');
      expect(retrieved?.displayName).toBe('Test Project');
    });

    it('should list all projects', async () => {
      await storage.createProject({ name: 'project-a', displayName: 'Project A' });
      await storage.createProject({ name: 'project-b', displayName: 'Project B' });

      const projects = await storage.listProjects();
      expect(projects.length).toBe(2);
    });

    it('should delete a project', async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });

      const deleted = await storage.deleteProject(project.id);
      expect(deleted).toBe(true);

      const retrieved = await storage.getProject(project.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Entries', () => {
    let projectId: string;

    beforeEach(async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      projectId = project.id;
    });

    it('should create an entry', async () => {
      const entry = await storage.createEntry({
        projectId,
        title: 'Test Entry',
        type: 'note',
        content: 'This is a test entry',
        tags: ['test', 'example'],
      });

      expect(entry.title).toBe('Test Entry');
      expect(entry.type).toBe('note');
      expect(entry.status).toBe('active');
      expect(entry.tags).toEqual(['test', 'example']);
      expect(entry.id).toMatch(/^unikortex_/);
    });

    it('should get an entry by id', async () => {
      const created = await storage.createEntry({
        projectId,
        title: 'Test Entry',
        type: 'note',
        content: 'Content',
      });

      const retrieved = await storage.getEntry(created.id);
      expect(retrieved?.title).toBe('Test Entry');
    });

    it('should update an entry', async () => {
      const created = await storage.createEntry({
        projectId,
        title: 'Original Title',
        type: 'note',
        content: 'Original content',
      });

      const updated = await storage.updateEntry(created.id, {
        title: 'Updated Title',
        content: 'Updated content',
      });

      expect(updated?.title).toBe('Updated Title');
      expect(updated?.content).toBe('Updated content');
      expect(updated?.version).toBe(2);
    });

    it('should list entries with filters', async () => {
      await storage.createEntry({
        projectId,
        title: 'Decision 1',
        type: 'decision',
        content: 'Content 1',
      });

      await storage.createEntry({
        projectId,
        title: 'Note 1',
        type: 'note',
        content: 'Content 2',
      });

      const decisions = await storage.listEntries({ type: ['decision'] });
      expect(decisions.items.length).toBe(1);
      expect(decisions.items[0]?.type).toBe('decision');

      const all = await storage.listEntries({ projectId });
      expect(all.items.length).toBe(2);
    });

    it('should delete an entry', async () => {
      const entry = await storage.createEntry({
        projectId,
        title: 'Test Entry',
        type: 'note',
        content: 'Content',
      });

      const deleted = await storage.deleteEntry(entry.id);
      expect(deleted).toBe(true);

      const retrieved = await storage.getEntry(entry.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Relations', () => {
    let projectId: string;
    let entry1Id: string;
    let entry2Id: string;

    beforeEach(async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      projectId = project.id;

      const entry1 = await storage.createEntry({
        projectId,
        title: 'Entry 1',
        type: 'decision',
        content: 'Content 1',
      });
      entry1Id = entry1.id;

      const entry2 = await storage.createEntry({
        projectId,
        title: 'Entry 2',
        type: 'artifact',
        content: 'Content 2',
      });
      entry2Id = entry2.id;
    });

    it('should create a relation', async () => {
      const relation = await storage.createRelation({
        fromId: entry1Id,
        toId: entry2Id,
        relationType: 'implements',
      });

      expect(relation.fromId).toBe(entry1Id);
      expect(relation.toId).toBe(entry2Id);
      expect(relation.relationType).toBe('implements');
    });

    it('should get entry relations', async () => {
      await storage.createRelation({
        fromId: entry1Id,
        toId: entry2Id,
        relationType: 'related',
      });

      const relations = await storage.getEntryRelations(entry1Id);
      expect(relations.length).toBe(1);
    });

    it('should get related entries', async () => {
      await storage.createRelation({
        fromId: entry1Id,
        toId: entry2Id,
        relationType: 'related',
      });

      const related = await storage.getRelatedEntries(entry1Id);
      expect(related.length).toBe(1);
      expect(related[0]?.id).toBe(entry2Id);
    });

    it('should delete a relation', async () => {
      await storage.createRelation({
        fromId: entry1Id,
        toId: entry2Id,
        relationType: 'related',
      });

      const deleted = await storage.deleteRelation(entry1Id, entry2Id);
      expect(deleted).toBe(true);

      const relations = await storage.getEntryRelations(entry1Id);
      expect(relations.length).toBe(0);
    });
  });

  describe('Full-Text Search', () => {
    let projectId: string;

    beforeEach(async () => {
      const project = await storage.createProject({
        name: 'test-project',
        displayName: 'Test Project',
      });
      projectId = project.id;

      await storage.createEntry({
        projectId,
        title: 'JWT Authentication',
        type: 'decision',
        content: 'We decided to use JWT tokens with refresh rotation for authentication.',
      });

      await storage.createEntry({
        projectId,
        title: 'Database Selection',
        type: 'decision',
        content: 'We chose PostgreSQL for our relational data storage needs.',
      });
    });

    it('should search entries by keyword', async () => {
      const results = await storage.searchEntries('JWT');
      expect(results.items.length).toBe(1);
      expect(results.items[0]?.title).toBe('JWT Authentication');
    });

    it('should search entries by content', async () => {
      const results = await storage.searchEntries('PostgreSQL');
      expect(results.items.length).toBe(1);
      expect(results.items[0]?.title).toBe('Database Selection');
    });

    it('should return empty results for non-matching query', async () => {
      const results = await storage.searchEntries('nonexistent');
      expect(results.items.length).toBe(0);
    });
  });
});

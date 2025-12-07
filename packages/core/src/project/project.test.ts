import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectService } from './project.js';
import { SQLiteStorage } from '../storage/sqlite.js';

describe('ProjectService', () => {
  let storage: SQLiteStorage;
  let projectService: ProjectService;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = path.join(os.tmpdir(), `unikortex-project-test-${Date.now()}.db`);
    storage = new SQLiteStorage(tempDbPath);
    await storage.initialize();
    projectService = new ProjectService(storage);
  });

  afterEach(async () => {
    await storage.close();
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('create', () => {
    it('should create a project with required fields', async () => {
      const project = await projectService.create({
        name: 'my-project',
        displayName: 'My Project',
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('my-project');
      expect(project.displayName).toBe('My Project');
    });

    it('should create a project with description', async () => {
      const project = await projectService.create({
        name: 'described-project',
        displayName: 'Described Project',
        description: 'This is a test project with a description',
      });

      expect(project.description).toBe('This is a test project with a description');
    });

    it('should reject invalid project name', async () => {
      await expect(
        projectService.create({
          name: 'Invalid Name With Spaces',
          displayName: 'Invalid',
        })
      ).rejects.toThrow();
    });

    it('should reject duplicate project names', async () => {
      await projectService.create({
        name: 'unique-name',
        displayName: 'First Project',
      });

      await expect(
        projectService.create({
          name: 'unique-name',
          displayName: 'Second Project',
        })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get a project by id', async () => {
      const created = await projectService.create({
        name: 'get-test',
        displayName: 'Get Test',
      });

      const retrieved = await projectService.get(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('get-test');
    });

    it('should return null for non-existent project', async () => {
      const result = await projectService.get('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getByName', () => {
    it('should get a project by name', async () => {
      await projectService.create({
        name: 'named-project',
        displayName: 'Named Project',
      });

      const retrieved = await projectService.getByName('named-project');
      expect(retrieved?.name).toBe('named-project');
      expect(retrieved?.displayName).toBe('Named Project');
    });

    it('should return null for non-existent name', async () => {
      const result = await projectService.getByName('does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update project display name', async () => {
      const created = await projectService.create({
        name: 'update-test',
        displayName: 'Original Name',
      });

      const updated = await projectService.update(created.id, {
        displayName: 'Updated Name',
      });

      expect(updated?.displayName).toBe('Updated Name');
    });

    it('should update project description', async () => {
      const created = await projectService.create({
        name: 'desc-update',
        displayName: 'Description Update',
      });

      const updated = await projectService.update(created.id, {
        description: 'New description',
      });

      expect(updated?.description).toBe('New description');
    });

    it('should return null when updating non-existent project', async () => {
      const result = await projectService.update('non-existent', {
        displayName: 'New Name',
      });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing project', async () => {
      const created = await projectService.create({
        name: 'delete-test',
        displayName: 'Delete Test',
      });

      const deleted = await projectService.delete(created.id);
      expect(deleted).toBe(true);

      const retrieved = await projectService.get(created.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent project', async () => {
      const deleted = await projectService.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await projectService.create({ name: 'project-a', displayName: 'Project A' });
      await projectService.create({ name: 'project-b', displayName: 'Project B' });
      await projectService.create({ name: 'project-c', displayName: 'Project C' });
    });

    it('should list all projects', async () => {
      const projects = await projectService.list();
      expect(projects.length).toBe(3);
    });

    it('should return projects sorted by name', async () => {
      const projects = await projectService.list();
      const names = projects.map((p) => p.name);
      expect(names).toEqual(['project-a', 'project-b', 'project-c']);
    });
  });

  describe('edge cases', () => {
    it('should handle project names with hyphens', async () => {
      const project = await projectService.create({
        name: 'my-complex-project-name',
        displayName: 'Complex Name',
      });

      expect(project.name).toBe('my-complex-project-name');
    });

    it('should handle project names with numbers', async () => {
      const project = await projectService.create({
        name: 'project123',
        displayName: 'Project 123',
      });

      expect(project.name).toBe('project123');
    });

    it('should handle empty description', async () => {
      const project = await projectService.create({
        name: 'no-desc',
        displayName: 'No Description',
        description: '',
      });

      expect(project.description).toBe('');
    });
  });
});

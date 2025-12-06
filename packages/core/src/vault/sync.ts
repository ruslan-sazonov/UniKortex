import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Entry, Config } from '../types.js';
import type { Storage } from '../storage/interface.js';
import { getVaultPath } from '../utils/config.js';
import { slugify } from '../utils/slug.js';
import { entryToMarkdown, markdownToEntry, generateProjectReadme } from './markdown.js';

/**
 * Service for syncing entries to the markdown vault
 */
export class VaultSyncService {
  private vaultPath: string;

  constructor(
    private storage: Storage,
    config?: Config
  ) {
    this.vaultPath = getVaultPath(config);
  }

  /**
   * Sync a single entry to the vault
   */
  async syncEntry(entry: Entry): Promise<string> {
    const project = await this.storage.getProject(entry.projectId);
    if (!project) {
      throw new Error(`Project "${entry.projectId}" not found`);
    }

    const projectDir = path.join(this.vaultPath, project.name);
    await this.ensureDirectory(projectDir);

    // Get related entry IDs
    const relations = await this.storage.getEntryRelations(entry.id);
    const relatedIds = relations.map((r) => (r.fromId === entry.id ? r.toId : r.fromId));

    // Generate markdown content
    const markdown = entryToMarkdown(entry, project.name, relatedIds);

    // Generate filename
    const filename = this.generateFilename(entry.title, entry.id);
    const filePath = path.join(projectDir, filename);

    // Write file
    fs.writeFileSync(filePath, markdown, 'utf-8');

    return filePath;
  }

  /**
   * Remove an entry from the vault
   */
  async removeEntry(entryId: string, projectName: string): Promise<boolean> {
    const projectDir = path.join(this.vaultPath, projectName);

    if (!fs.existsSync(projectDir)) {
      return false;
    }

    // Find the file by entry ID in frontmatter
    const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(projectDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = markdownToEntry(content);

      if (parsed?.frontmatter.id === entryId) {
        fs.unlinkSync(filePath);
        return true;
      }
    }

    return false;
  }

  /**
   * Sync all entries for a project
   */
  async syncProject(projectId: string): Promise<{ synced: number; errors: string[] }> {
    const project = await this.storage.getProject(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const projectDir = path.join(this.vaultPath, project.name);
    await this.ensureDirectory(projectDir);

    const entries = await this.storage.listEntries({ projectId, limit: 10000 });
    const errors: string[] = [];
    let synced = 0;

    for (const entry of entries.items) {
      try {
        await this.syncEntry(entry);
        synced++;
      } catch (error) {
        errors.push(`Failed to sync entry "${entry.id}": ${error}`);
      }
    }

    // Generate project README
    const readme = generateProjectReadme(project, entries.total);
    fs.writeFileSync(path.join(projectDir, 'README.md'), readme, 'utf-8');

    return { synced, errors };
  }

  /**
   * Sync all entries in the vault
   */
  async syncAll(): Promise<{ synced: number; errors: string[] }> {
    const projects = await this.storage.listProjects();
    let totalSynced = 0;
    const allErrors: string[] = [];

    for (const project of projects) {
      const result = await this.syncProject(project.id);
      totalSynced += result.synced;
      allErrors.push(...result.errors);
    }

    return { synced: totalSynced, errors: allErrors };
  }

  /**
   * Import entries from the vault into the database
   */
  async importFromVault(): Promise<{
    imported: number;
    updated: number;
    errors: string[];
  }> {
    if (!fs.existsSync(this.vaultPath)) {
      return { imported: 0, updated: 0, errors: [] };
    }

    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    // Get all project directories
    const dirs = fs.readdirSync(this.vaultPath, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(this.vaultPath, dir.name);
      const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.md') && f !== 'README.md');

      for (const file of files) {
        try {
          const filePath = path.join(projectDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = markdownToEntry(content);

          if (!parsed) {
            errors.push(`Invalid markdown file: ${filePath}`);
            continue;
          }

          // Get or create the project
          let project = await this.storage.getProjectByName(parsed.frontmatter.project);
          if (!project) {
            project = await this.storage.createProject({
              name: parsed.frontmatter.project,
              displayName: this.generateDisplayName(parsed.frontmatter.project),
            });
          }

          // Check if entry already exists
          const existing = await this.storage.getEntry(parsed.frontmatter.id);

          if (existing) {
            // Update if vault version is newer
            if (new Date(parsed.frontmatter.updatedAt) > existing.updatedAt) {
              await this.storage.updateEntry(existing.id, {
                title: parsed.frontmatter.title,
                type: parsed.frontmatter.type,
                status: parsed.frontmatter.status,
                content: parsed.content,
                contextSummary: parsed.frontmatter.contextSummary,
                tags: parsed.frontmatter.tags,
                supersedes: parsed.frontmatter.supersedes,
              });
              updated++;
            }
          } else {
            // Create new entry
            await this.storage.createEntry({
              projectId: project.id,
              title: parsed.frontmatter.title,
              type: parsed.frontmatter.type,
              status: parsed.frontmatter.status,
              content: parsed.content,
              contextSummary: parsed.frontmatter.contextSummary,
              tags: parsed.frontmatter.tags,
              supersedes: parsed.frontmatter.supersedes,
            });
            imported++;
          }
        } catch (error) {
          errors.push(`Error importing ${file}: ${error}`);
        }
      }
    }

    return { imported, updated, errors };
  }

  /**
   * Get the vault path
   */
  getVaultPath(): string {
    return this.vaultPath;
  }

  /**
   * Check if vault is initialized
   */
  isInitialized(): boolean {
    return fs.existsSync(this.vaultPath);
  }

  /**
   * Initialize the vault directory
   */
  async initialize(): Promise<void> {
    await this.ensureDirectory(this.vaultPath);
  }

  // === Private Methods ===

  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  private generateFilename(title: string, entryId: string): string {
    const slug = slugify(title);
    // Include a short ID suffix to ensure uniqueness
    const shortId = entryId.slice(-6);
    return `${slug}-${shortId}.md`;
  }

  private generateDisplayName(name: string): string {
    return name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

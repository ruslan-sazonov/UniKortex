import type { Project, CreateProjectInput, UpdateProjectInput } from '../types.js';
import { CreateProjectInput as CreateProjectInputSchema } from '../types.js';
import type { Storage } from '../storage/interface.js';

/**
 * Service for managing projects
 */
export class ProjectService {
  constructor(private storage: Storage) {}

  /**
   * Create a new project
   */
  async create(input: CreateProjectInput): Promise<Project> {
    // Validate and normalize input
    const validated = CreateProjectInputSchema.parse(input);

    // Normalize name to lowercase with hyphens
    validated.name = this.normalizeName(validated.name);

    return this.storage.createProject(validated);
  }

  /**
   * Get a project by ID
   */
  async get(id: string): Promise<Project | null> {
    return this.storage.getProject(id);
  }

  /**
   * Get a project by name
   */
  async getByName(name: string): Promise<Project | null> {
    const normalizedName = this.normalizeName(name);
    return this.storage.getProjectByName(normalizedName);
  }

  /**
   * Get or create a project by name
   * Useful for CLI commands that accept project name
   */
  async getOrCreate(name: string, displayName?: string): Promise<Project> {
    const normalizedName = this.normalizeName(name);
    const existing = await this.storage.getProjectByName(normalizedName);

    if (existing) {
      return existing;
    }

    return this.create({
      name: normalizedName,
      displayName: displayName ?? this.generateDisplayName(normalizedName),
    });
  }

  /**
   * Update a project
   */
  async update(id: string, input: UpdateProjectInput): Promise<Project | null> {
    return this.storage.updateProject(id, input);
  }

  /**
   * Delete a project and all its entries
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.deleteProject(id);
  }

  /**
   * List all projects
   */
  async list(): Promise<Project[]> {
    return this.storage.listProjects();
  }

  /**
   * Check if a project exists by name
   */
  async exists(name: string): Promise<boolean> {
    const project = await this.getByName(name);
    return project !== null;
  }

  /**
   * Get project statistics
   */
  async getStats(
    projectId: string
  ): Promise<{ totalEntries: number; entriesByType: Record<string, number> } | null> {
    const project = await this.get(projectId);
    if (!project) {
      return null;
    }

    const entries = await this.storage.listEntries({
      projectId,
      limit: 1000,
    });

    const entriesByType: Record<string, number> = {};
    for (const entry of entries.items) {
      entriesByType[entry.type] = (entriesByType[entry.type] ?? 0) + 1;
    }

    return {
      totalEntries: entries.total,
      entriesByType,
    };
  }

  /**
   * Normalize a project name
   * - Convert to lowercase
   * - Replace spaces and underscores with hyphens
   * - Remove non-alphanumeric characters except hyphens
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate a display name from a normalized name
   */
  private generateDisplayName(normalizedName: string): string {
    return normalizedName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

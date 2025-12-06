import type { Entry, Project, EntryRelation } from '@unikortex/core';

/**
 * Format entries as JSON
 */
export function formatEntriesJson(entries: Entry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Format projects as JSON
 */
export function formatProjectsJson(projects: Project[], activeProject?: string): string {
  const projectsWithActive = projects.map((p) => ({
    ...p,
    isActive: p.name === activeProject,
  }));
  return JSON.stringify({ projects: projectsWithActive, activeProject: activeProject ?? null }, null, 2);
}

/**
 * Format relations as JSON
 */
export function formatRelationsJson(relations: EntryRelation[]): string {
  return JSON.stringify(relations, null, 2);
}

/**
 * Format any data as JSON
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format entry IDs only (for scripting)
 */
export function formatEntryIds(entries: Entry[]): string {
  return entries.map((e) => e.id).join('\n');
}

/**
 * Format project names only (for scripting)
 */
export function formatProjectNames(projects: Project[]): string {
  return projects.map((p) => p.name).join('\n');
}

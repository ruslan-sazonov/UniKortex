import matter from 'gray-matter';
import type { Entry, Project } from '../types.js';

/**
 * Frontmatter structure for markdown files
 */
export interface EntryFrontmatter {
  id: string;
  title: string;
  type: Entry['type'];
  status: Entry['status'];
  project: string;
  tags: string[];
  contextSummary?: string;
  supersedes?: string;
  related?: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Generate markdown content with YAML frontmatter from an entry
 */
export function entryToMarkdown(entry: Entry, projectName: string, relatedIds?: string[]): string {
  const frontmatter: EntryFrontmatter = {
    id: entry.id,
    title: entry.title,
    type: entry.type,
    status: entry.status,
    project: projectName,
    tags: entry.tags,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    version: entry.version,
  };

  if (entry.contextSummary) {
    frontmatter.contextSummary = entry.contextSummary;
  }

  if (entry.supersedes) {
    frontmatter.supersedes = entry.supersedes;
  }

  if (relatedIds && relatedIds.length > 0) {
    frontmatter.related = relatedIds;
  }

  return matter.stringify(entry.content, frontmatter);
}

/**
 * Parse a markdown file into entry data
 */
export function markdownToEntry(
  content: string
): { frontmatter: EntryFrontmatter; content: string } | null {
  try {
    const parsed = matter(content);

    const frontmatter = parsed.data as Partial<EntryFrontmatter>;

    // Validate required fields
    if (
      !frontmatter.id ||
      !frontmatter.title ||
      !frontmatter.type ||
      !frontmatter.status ||
      !frontmatter.project
    ) {
      return null;
    }

    return {
      frontmatter: {
        id: frontmatter.id,
        title: frontmatter.title,
        type: frontmatter.type,
        status: frontmatter.status,
        project: frontmatter.project,
        tags: frontmatter.tags ?? [],
        contextSummary: frontmatter.contextSummary,
        supersedes: frontmatter.supersedes,
        related: frontmatter.related,
        createdAt: frontmatter.createdAt ?? new Date().toISOString(),
        updatedAt: frontmatter.updatedAt ?? new Date().toISOString(),
        version: frontmatter.version ?? 1,
      },
      content: parsed.content.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Convert frontmatter to partial entry input for import
 */
export function frontmatterToEntryInput(
  frontmatter: EntryFrontmatter,
  content: string,
  projectId: string
): {
  id: string;
  projectId: string;
  title: string;
  type: Entry['type'];
  status: Entry['status'];
  content: string;
  contextSummary?: string;
  tags: string[];
  supersedes?: string;
} {
  return {
    id: frontmatter.id,
    projectId,
    title: frontmatter.title,
    type: frontmatter.type,
    status: frontmatter.status,
    content,
    contextSummary: frontmatter.contextSummary,
    tags: frontmatter.tags,
    supersedes: frontmatter.supersedes,
  };
}

/**
 * Generate a project README content
 */
export function generateProjectReadme(project: Project, entryCount: number): string {
  return `# ${project.displayName}

${project.description ?? ''}

---

*This project contains ${entryCount} knowledge entries.*

*Managed by [UniKortex](https://github.com/anthropic-community/unikortex)*
`;
}

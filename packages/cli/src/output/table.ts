import Table from 'cli-table3';
import chalk from 'chalk';
import type { Entry, Project, EntryRelation } from '@unikortex/core';

/**
 * Format entries as a table
 */
export function formatEntriesTable(entries: Entry[]): string {
  if (entries.length === 0) {
    return chalk.dim('No entries found.');
  }

  const table = new Table({
    head: [
      chalk.bold('ID'),
      chalk.bold('Title'),
      chalk.bold('Type'),
      chalk.bold('Status'),
      chalk.bold('Updated'),
    ],
    colWidths: [22, 40, 12, 12, 20],
    wordWrap: true,
  });

  for (const entry of entries) {
    table.push([
      chalk.cyan(entry.id.slice(0, 20)),
      truncate(entry.title, 38),
      formatType(entry.type),
      formatStatus(entry.status),
      formatDate(entry.updatedAt),
    ]);
  }

  return table.toString();
}

/**
 * Format projects as a table
 */
export function formatProjectsTable(projects: Project[], activeProject?: string): string {
  if (projects.length === 0) {
    return chalk.dim('No projects found.');
  }

  const table = new Table({
    head: [
      chalk.bold(''),
      chalk.bold('Name'),
      chalk.bold('Display Name'),
      chalk.bold('Description'),
      chalk.bold('Created'),
    ],
    colWidths: [3, 20, 25, 32, 20],
    wordWrap: true,
  });

  for (const project of projects) {
    const isActive = project.name === activeProject;
    table.push([
      isActive ? chalk.green('●') : '',
      isActive ? chalk.green.bold(project.name) : chalk.cyan(project.name),
      isActive ? chalk.green(project.displayName) : project.displayName,
      truncate(project.description ?? '', 30),
      formatDate(project.createdAt),
    ]);
  }

  return table.toString();
}

/**
 * Format relations as a table
 */
export function formatRelationsTable(
  relations: EntryRelation[],
  currentEntryId: string
): string {
  if (relations.length === 0) {
    return chalk.dim('No relations found.');
  }

  const table = new Table({
    head: [
      chalk.bold('Direction'),
      chalk.bold('Related Entry'),
      chalk.bold('Relation Type'),
    ],
    colWidths: [12, 30, 15],
  });

  for (const relation of relations) {
    const isOutgoing = relation.fromId === currentEntryId;
    const relatedId = isOutgoing ? relation.toId : relation.fromId;

    table.push([
      isOutgoing ? chalk.green('→ outgoing') : chalk.blue('← incoming'),
      chalk.cyan(relatedId.slice(0, 28)),
      formatRelationType(relation.relationType),
    ]);
  }

  return table.toString();
}

/**
 * Format a single entry for detailed view
 */
export function formatEntryDetails(entry: Entry, projectName?: string): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`# ${entry.title}`));
  lines.push('');
  lines.push(`${chalk.bold('ID:')}         ${entry.id}`);
  lines.push(`${chalk.bold('Project:')}    ${projectName ?? entry.projectId}`);
  lines.push(`${chalk.bold('Type:')}       ${formatType(entry.type)}`);
  lines.push(`${chalk.bold('Status:')}     ${formatStatus(entry.status)}`);

  if (entry.tags.length > 0) {
    lines.push(`${chalk.bold('Tags:')}       ${entry.tags.map((t) => chalk.yellow(t)).join(', ')}`);
  }

  if (entry.contextSummary) {
    lines.push(`${chalk.bold('Summary:')}    ${chalk.dim(entry.contextSummary)}`);
  }

  if (entry.supersedes) {
    lines.push(`${chalk.bold('Supersedes:')} ${chalk.cyan(entry.supersedes)}`);
  }

  lines.push(`${chalk.bold('Created:')}    ${entry.createdAt.toLocaleString()}`);
  lines.push(`${chalk.bold('Updated:')}    ${entry.updatedAt.toLocaleString()}`);
  lines.push(`${chalk.bold('Version:')}    ${entry.version}`);
  lines.push('');
  lines.push(chalk.bold('Content:'));
  lines.push(chalk.dim('─'.repeat(60)));
  lines.push(entry.content);

  return lines.join('\n');
}

/**
 * Format a single project for detailed view
 */
export function formatProjectDetails(
  project: Project,
  stats?: { totalEntries: number; entriesByType: Record<string, number> }
): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`# ${project.displayName}`));
  lines.push('');
  lines.push(`${chalk.bold('Name:')}        ${project.name}`);

  if (project.description) {
    lines.push(`${chalk.bold('Description:')} ${project.description}`);
  }

  lines.push(`${chalk.bold('Created:')}     ${project.createdAt.toLocaleString()}`);
  lines.push(`${chalk.bold('Updated:')}     ${project.updatedAt.toLocaleString()}`);

  if (stats) {
    lines.push('');
    lines.push(chalk.bold('Statistics:'));
    lines.push(`  Total entries: ${stats.totalEntries}`);

    if (Object.keys(stats.entriesByType).length > 0) {
      lines.push('  By type:');
      for (const [type, count] of Object.entries(stats.entriesByType)) {
        lines.push(`    ${formatType(type as Entry['type'])}: ${count}`);
      }
    }
  }

  return lines.join('\n');
}

// === Helper Functions ===

function formatType(type: string): string {
  const colors: Record<string, (s: string) => string> = {
    decision: chalk.magenta,
    research: chalk.blue,
    artifact: chalk.green,
    note: chalk.yellow,
    reference: chalk.cyan,
  };
  const colorFn = colors[type] ?? chalk.white;
  return colorFn(type);
}

function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    draft: chalk.yellow,
    active: chalk.green,
    superseded: chalk.dim,
    archived: chalk.gray,
  };
  const colorFn = colors[status] ?? chalk.white;
  return colorFn(status);
}

function formatRelationType(type: string): string {
  const colors: Record<string, (s: string) => string> = {
    related: chalk.blue,
    implements: chalk.green,
    extends: chalk.cyan,
    contradicts: chalk.red,
  };
  const colorFn = colors[type] ?? chalk.white;
  return colorFn(type);
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return chalk.green('today');
  } else if (days === 1) {
    return chalk.green('yesterday');
  } else if (days < 7) {
    return chalk.yellow(`${days} days ago`);
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return chalk.dim(`${weeks} week${weeks > 1 ? 's' : ''} ago`);
  } else {
    return chalk.dim(date.toLocaleDateString());
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  return str.slice(0, maxLen - 1) + '…';
}

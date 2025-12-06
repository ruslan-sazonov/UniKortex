import type {
  Entry,
  Project,
  EntryRelation,
  CreateEntryInput,
  UpdateEntryInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateRelationInput,
  EntryFilters,
  PaginatedResult,
} from '../types.js';

/**
 * Abstract storage interface for UniKortex
 * Implemented by SQLite (personal mode) and PostgreSQL (team mode)
 */
export interface Storage {
  // === Lifecycle ===
  initialize(): Promise<void>;
  close(): Promise<void>;

  // === Projects ===
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  getProjectByName(name: string): Promise<Project | null>;
  updateProject(id: string, input: UpdateProjectInput): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  listProjects(): Promise<Project[]>;

  // === Entries ===
  createEntry(input: CreateEntryInput): Promise<Entry>;
  getEntry(id: string): Promise<Entry | null>;
  updateEntry(id: string, input: UpdateEntryInput): Promise<Entry | null>;
  deleteEntry(id: string): Promise<boolean>;
  listEntries(filters?: EntryFilters): Promise<PaginatedResult<Entry>>;

  // === Tags ===
  getEntryTags(entryId: string): Promise<string[]>;
  setEntryTags(entryId: string, tags: string[]): Promise<void>;
  getAllTags(): Promise<string[]>;

  // === Relations ===
  createRelation(input: CreateRelationInput): Promise<EntryRelation>;
  getRelation(fromId: string, toId: string): Promise<EntryRelation | null>;
  deleteRelation(fromId: string, toId: string): Promise<boolean>;
  getEntryRelations(entryId: string): Promise<EntryRelation[]>;
  getRelatedEntries(entryId: string): Promise<Entry[]>;

  // === Search ===
  searchEntries(query: string, filters?: EntryFilters): Promise<PaginatedResult<Entry>>;
}

/**
 * Error thrown when a storage operation fails
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Error codes for storage operations
 */
export const StorageErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  INVALID_INPUT: 'INVALID_INPUT',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

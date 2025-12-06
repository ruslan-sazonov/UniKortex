import { nanoid } from 'nanoid';

const ENTRY_ID_PREFIX = 'unikortex_';
const ID_LENGTH = 12;

/**
 * Generate a unique entry ID in the format: unikortex_xxxxxxxxxxxx
 */
export function generateEntryId(): string {
  return `${ENTRY_ID_PREFIX}${nanoid(ID_LENGTH)}`;
}

/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  return `proj_${nanoid(ID_LENGTH)}`;
}

/**
 * Validate if a string is a valid entry ID
 */
export function isValidEntryId(id: string): boolean {
  const pattern = new RegExp(`^${ENTRY_ID_PREFIX}[a-zA-Z0-9]{${ID_LENGTH}}$`);
  return pattern.test(id);
}

/**
 * Extract the nanoid portion from an entry ID
 */
export function extractIdPart(entryId: string): string | null {
  if (!isValidEntryId(entryId)) {
    return null;
  }
  return entryId.slice(ENTRY_ID_PREFIX.length);
}

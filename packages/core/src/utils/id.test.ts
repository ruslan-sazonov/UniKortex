import { describe, it, expect } from 'vitest';
import { generateEntryId, generateProjectId, isValidEntryId, extractIdPart } from './id.js';

describe('ID Generation', () => {
  describe('generateEntryId', () => {
    it('should generate an ID with unikortex_ prefix', () => {
      const id = generateEntryId();
      expect(id.startsWith('unikortex_')).toBe(true);
    });

    it('should generate an ID with 12 characters after prefix', () => {
      const id = generateEntryId();
      expect(id.length).toBe('unikortex_'.length + 12);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEntryId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateProjectId', () => {
    it('should generate an ID with proj_ prefix', () => {
      const id = generateProjectId();
      expect(id.startsWith('proj_')).toBe(true);
    });
  });

  describe('isValidEntryId', () => {
    it('should return true for valid entry IDs', () => {
      expect(isValidEntryId('unikortex_abc123def456')).toBe(true);
      expect(isValidEntryId('unikortex_ABC123DEF456')).toBe(true);
      expect(isValidEntryId('unikortex_123456789012')).toBe(true);
    });

    it('should return false for invalid entry IDs', () => {
      expect(isValidEntryId('')).toBe(false);
      expect(isValidEntryId('unikortex_')).toBe(false);
      expect(isValidEntryId('unikortex_abc')).toBe(false); // Too short
      expect(isValidEntryId('unikortex_abc123def4567')).toBe(false); // Too long
      expect(isValidEntryId('wrong_abc123def456')).toBe(false); // Wrong prefix
      expect(isValidEntryId('unikortex_abc123def45!')).toBe(false); // Invalid char
    });
  });

  describe('extractIdPart', () => {
    it('should extract the nanoid part from valid entry IDs', () => {
      expect(extractIdPart('unikortex_abc123def456')).toBe('abc123def456');
    });

    it('should return null for invalid entry IDs', () => {
      expect(extractIdPart('invalid')).toBe(null);
      expect(extractIdPart('')).toBe(null);
    });
  });
});

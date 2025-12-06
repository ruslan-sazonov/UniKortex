import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug, unslugify } from './slug.js';

describe('Slug Utils', () => {
  describe('slugify', () => {
    it('should convert text to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world')).toBe('hello-world');
    });

    it('should replace underscores with hyphens', () => {
      expect(slugify('hello_world')).toBe('hello-world');
    });

    it('should remove non-alphanumeric characters', () => {
      expect(slugify("Hello, World! What's up?")).toBe('hello-world-whats-up');
    });

    it('should collapse multiple hyphens', () => {
      expect(slugify('hello---world')).toBe('hello-world');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(slugify('--hello world--')).toBe('hello-world');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should truncate long slugs', () => {
      const longText = 'a'.repeat(150);
      expect(slugify(longText).length).toBeLessThanOrEqual(100);
    });

    it('should handle unicode characters', () => {
      expect(slugify('Café résumé')).toBe('caf-rsum');
    });
  });

  describe('uniqueSlug', () => {
    it('should return the slug if not in existing set', () => {
      const existing = new Set(['other-slug']);
      expect(uniqueSlug('hello world', existing)).toBe('hello-world');
    });

    it('should append number if slug exists', () => {
      const existing = new Set(['hello-world']);
      expect(uniqueSlug('hello world', existing)).toBe('hello-world-1');
    });

    it('should increment number until unique', () => {
      const existing = new Set(['hello-world', 'hello-world-1', 'hello-world-2']);
      expect(uniqueSlug('hello world', existing)).toBe('hello-world-3');
    });
  });

  describe('unslugify', () => {
    it('should convert slug back to title case', () => {
      expect(unslugify('hello-world')).toBe('Hello World');
    });

    it('should handle single word', () => {
      expect(unslugify('hello')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(unslugify('')).toBe('');
    });
  });
});

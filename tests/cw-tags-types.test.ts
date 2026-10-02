import { describe, it, expect } from 'vitest';
import { CW_TAG_SEEDS } from '../src/types';

describe('CW_TAG_SEEDS', () => {
  it('has no specialty presets', () => {
    expect(CW_TAG_SEEDS).toHaveLength(0);
  });
  it('every seed has unique slug', () => {
    const slugs = CW_TAG_SEEDS.map(t => t.slug);
    expect(new Set(slugs).size).toBe(0);
  });
  it('every seed has required fields', () => {
    for (const t of CW_TAG_SEEDS) {
      expect(typeof t.slug).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.color).toBe('string');
      expect([0, 1]).toContain(t.is_spoiler);
      expect([0, 1]).toContain(t.is_nsfw);
    }
  });
  it('nsfw tags are also spoilers', () => {
    for (const t of CW_TAG_SEEDS) {
      if (t.is_nsfw === 1) expect(t.is_spoiler).toBe(1);
    }
  });
});

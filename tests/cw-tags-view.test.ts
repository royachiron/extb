import { describe, it, expect } from 'vitest';
import { cwTagPills, tagPicker, wrapWithCwGuard } from '../src/views/tags';
import type { CwTag } from '../src/types';

const t = (id: number, opts: Partial<CwTag> = {}): CwTag => ({
  id, slug: `s-${id}`, name: `T${id}`, description: '', color: '#000',
  is_spoiler: 0, is_nsfw: 0, sort_order: id, is_archived: 0, created_at: 0, ...opts,
});

describe('cwTagPills', () => {
  it('renders nothing for empty', () => { expect(cwTagPills([])).toBe(''); });
  it('renders each as a span with color', () => {
    const html = cwTagPills([t(1, { color: '#ff0000', name: 'A' })]);
    expect(html).toContain('background:#ff0000');
    expect(html).toContain('>A<');
  });
});

describe('tagPicker', () => {
  it('marks selected ids as checked', () => {
    const html = tagPicker([t(1), t(2)], [2]);
    expect(html).toMatch(/value="1"(?![^>]*checked)/);
    expect(html).toMatch(/value="2"[^>]*checked/);
  });
});

describe('wrapWithCwGuard', () => {
  it('returns raw body when no flags', () => {
    expect(wrapWithCwGuard([], '<p>x</p>', 1, 'post-1')).toBe('<p>x</p>');
  });
  it('renders nsfw placeholder when nsfw tag and viewer off', () => {
    const html = wrapWithCwGuard([t(1, { is_nsfw: 1, is_spoiler: 1 })], '<p>x</p>', 0, 'post-1');
    expect(html).toContain('cw-nsfw-gate');
    expect(html).not.toContain('<p>x</p>');
  });
  it('blurs when spoiler tag', () => {
    const html = wrapWithCwGuard([t(1, { is_spoiler: 1 })], '<p>x</p>', 1, 'post-1');
    expect(html).toContain('cw-blur-wrap');
    expect(html).toContain('data-cw-id="post-1"');
  });
  it('shows blur when nsfw tag but viewer enabled', () => {
    const html = wrapWithCwGuard([t(1, { is_nsfw: 1, is_spoiler: 1 })], '<p>x</p>', 1, 'post-1');
    expect(html).toContain('cw-blur-wrap');
  });
});

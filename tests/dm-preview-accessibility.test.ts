import { describe, expect, it } from 'vitest';
import { renderThread } from '../src/views/dms';

describe('DM Markdown preview', () => {
  it('is a polite status region', () => {
    const user = { id: 1, display_name: 'Me', avatar_color: '#000' } as any;
    const other = { id: 2, display_name: 'You', avatar_color: '#000' } as any;
    const html = renderThread({ user, other, dms: [] });

    expect(html).toContain('id="dm-preview"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

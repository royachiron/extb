import { describe, it, expect } from 'vitest';
import { esc, initials, csrfField, markdownToolbar, roomIcon } from '../src/views/layout-utils';

describe('esc', () => {
  it('escapes all five HTML-significant chars', () => {
    expect(esc('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
  it('returns empty string for null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('initials', () => {
  it('takes first letter of first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });
  it('takes two letters of a single word', () => {
    expect(initials('Ada')).toBe('AD');
  });
  it('returns ? for empty', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('csrfField', () => {
  it('emits a hidden input with the escaped token', () => {
    expect(csrfField({ csrfToken: 'a&b' })).toBe('<input type="hidden" name="csrf" value="a&amp;b">');
  });
  it('emits nothing without a token', () => {
    expect(csrfField({})).toBe('');
  });
});

describe('markdownToolbar', () => {
  it('marks the preview as a polite status region', () => {
    const html = markdownToolbar('body', 'body-preview');
    expect(html).toContain('id="body-preview"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('roomIcon', () => {
  it('prefers the room.icon override', () => {
    expect(roomIcon({ icon: '🚀', name: 'General' } as any)).toBe('🚀');
  });
  it('falls back to the name map then the bullet', () => {
    expect(roomIcon({ icon: '', name: 'General' } as any)).toBe('💬');
    expect(roomIcon({ icon: '', name: 'Nonexistent' } as any)).toBe('•');
  });
});

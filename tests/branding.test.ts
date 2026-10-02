import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING, brandingFromSettings, validateBranding } from '../src/lib/branding';
import { renderLayout } from '../src/views/layout';
import { linkifyChat } from '../src/views/chat';
import { renderTosBody } from '../src/views/tos';
describe('community branding', () => {
  it('uses neutral defaults for a fresh installation', () => { expect(brandingFromSettings([])).toEqual(DEFAULT_BRANDING); });
  it('rejects script URLs, credential URLs, CSS injections, and invalid contacts', () => {
    for (const values of [{ logo_url: 'javascript:alert(1)' }, { logo_url: 'https://u:p@example.com/logo' }, { accent_color: '#fff;display:none' }, { contact_email: 'wrong' }]) expect(() => validateBranding({ ...DEFAULT_BRANDING, ...values })).toThrow();
  });
  it('renders branding and canonical links without sharing state or injecting HTML', () => {
    const branding = { ...DEFAULT_BRANDING, name: '<script>alert(1)</script>', description: 'Fresh conversations', logo_url: 'https://example.com/logo.png', accent_color: '#123456' };
    const html = renderLayout({ user: null, rooms: [], body: '<p>Member content</p>', title: 'Home', branding, origin: 'https://community.example', canonicalUrl: '/' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;'); expect(html).toContain('https://community.example/'); expect(html).toContain('--primary: #123456'); expect(html).not.toContain('extb.test');
    expect(renderLayout({ user: null, rooms: [], body: '', title: 'Home' })).toContain(' - EXTB</title>');
  });
  it('escapes customized rules', () => { expect(renderTosBody({ ...DEFAULT_BRANDING, rules: '<img src=x onerror=alert(1)>' })).toContain('&lt;img'); });
  it('classifies chat links using the current installation origin', () => {
    expect(linkifyChat('https://community.example/t/abc', 'https://community.example')).toContain('href="/t/abc"');
    expect(linkifyChat('https://other.example/t/abc', 'https://community.example')).toContain('target="_blank"');
    expect(linkifyChat('https://community.example/t/abc')).toContain('target="_blank"');
    expect(linkifyChat('http://community.example/t/abc', 'https://community.example')).toContain('target="_blank"');
  });
});

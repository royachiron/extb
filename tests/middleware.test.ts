import { describe, it, expect } from 'vitest';
import { parseCookies } from '../src/middleware';
import { applySecurityHeaders } from '../src/lib/security-headers';

describe('parseCookies', () => {
  it('returns {} when header is null', () => {
    expect(parseCookies(null)).toEqual({});
  });

  it('returns {} when header is empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('parses a single cookie', () => {
    expect(parseCookies('session=abc')).toEqual({ session: 'abc' });
  });

  it('parses multiple cookies separated by ; ', () => {
    expect(parseCookies('session=abc; theme=dark; lang=en')).toEqual({
      session: 'abc',
      theme: 'dark',
      lang: 'en'
    });
  });

  it('trims whitespace around names and values', () => {
    expect(parseCookies('  a = 1 ;  b=2  ')).toEqual({ a: '1', b: '2' });
  });

  it('ignores malformed pairs without =', () => {
    expect(parseCookies('session=abc; broken; theme=dark')).toEqual({
      session: 'abc',
      theme: 'dark'
    });
  });

  it('keeps first occurrence on duplicate keys', () => {
    expect(parseCookies('a=1; a=2')).toEqual({ a: '1' });
  });
});

describe('applySecurityHeaders', () => {
  it('allows current external font and analytics hosts in the enforced CSP', () => {
    const res = applySecurityHeaders(new Response('<html></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain('https://static.cloudflareinsights.com');
  });
});

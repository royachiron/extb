import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from '../src/lib/security-headers';

describe('applySecurityHeaders', () => {
  it('prevents browser reuse between full-page and HTMX HTML responses', () => {
    const res = applySecurityHeaders(new Response('<main>topic</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));

    expect(res.headers.get('Cache-Control')).toBe('private, no-store, must-revalidate');
    expect(res.headers.get('Vary')).toBe('HX-Request, Cookie');
  });

  it('preserves existing vary values while adding HTML representation keys', () => {
    const res = applySecurityHeaders(new Response('<main>topic</main>', {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        Vary: 'Accept-Encoding',
      },
    }));

    expect(res.headers.get('Vary')).toBe('Accept-Encoding, HX-Request, Cookie');
  });
});

import { describe, expect, it } from 'vitest';
import { getServiceWorker } from '../src/api/static';

async function swText(): Promise<string> {
  const res = await getServiceWorker({} as any, {} as any);
  return await res.text();
}

describe('service worker cache behavior', () => {
  it('bypasses cache for top-level and HTMX HTML requests', async () => {
    const sw = await swText();
    expect(sw).toContain("req.mode === 'navigate'");
    expect(sw).toContain("req.destination === 'document'");
    expect(sw).toContain("req.headers.get('hx-request') === 'true'");
    expect(sw).toContain("fetch(req, { cache: 'reload' })");
  });

  it('uses a fresh network request for cached CSS assets', async () => {
    const sw = await swText();
    expect(sw).toContain("const CACHE_NAME = 'extb-v1'");
    expect(sw).toContain("ASSETS.indexOf(url.pathname) !== -1");
    expect(sw).toContain("caches.open(CACHE_NAME)");
  });

  it('serves the service worker itself with no-store headers', async () => {
    const res = await getServiceWorker({} as any, {} as any);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

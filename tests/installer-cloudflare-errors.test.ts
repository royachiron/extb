import { afterEach, describe, expect, it, vi } from 'vitest';
import { cf } from '../installer/src/cloudflare';

afterEach(() => vi.unstubAllGlobals());

describe('installer Cloudflare errors', () => {
  it('names the refused endpoint without exposing account or Worker ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false, errors: [{ code: 10000, message: 'token SECRET' }] }, { status: 403 })));
    const error = await cf('token', '/accounts/abc123/workers/scripts/my-forum/subdomain', { method: 'POST', body: '{}' }).catch((e: Error) => e);
    expect(String(error)).toContain('Cloudflare request failed (403; codes 10000; POST /accounts/:account/workers/scripts/:worker/subdomain)');
    expect(String(error)).not.toMatch(/SECRET|abc123|my-forum/);
  });

  it('reports non-JSON refusals instead of a parse error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
    await expect(cf('jwt', '/accounts/abc123/workers/assets/upload?base64=true', { method: 'POST' }))
      .rejects.toThrow('Cloudflare request failed (403; codes ; POST /accounts/:account/workers/assets/upload)');
  });
});

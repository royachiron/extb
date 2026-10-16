import { describe, expect, it, vi } from 'vitest';
import worker from '../installer/src/index';

const origin = 'https://extb.achiron.fyi';

function environment(destination: string) {
  // Durable Object fetch follows redirects unless the request says otherwise.
  // Following the OAuth redirect inside the stub loses the browser handoff.
  const fetch = vi.fn(async (request: Request) => request.redirect === 'manual'
    ? Response.redirect(destination, 302)
    : Response.json({ error: 'Cloudflare authorization required' }, { status: 401 }));
  const env = {
    INSTALLER_ORIGIN: origin,
    OAUTH_CLIENT_ID: 'client', OAUTH_SCOPE: 'scope', ENCRYPTION_KEY: 'key',
    RELEASE_MANIFEST_URL: '', RELEASE_MANIFEST_SHA256: '',
    INSTALLATIONS: { idFromName: vi.fn(), get: () => ({ fetch }) },
  } as unknown as Parameters<typeof worker.fetch>[1];
  return { env, fetch };
}

describe('installer browser redirects', () => {
  it('hands OAuth authorization to the browser and sets the session cookie', async () => {
    const destination = 'https://dash.cloudflare.com/oauth2/auth?state=example';
    const { env } = environment(destination);
    const response = await worker.fetch(new Request(origin + '/oauth/start'), env);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(destination);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-extb_install=');
  });

  it('returns the callback redirect without fetching the wizard inside the stub', async () => {
    const destination = origin + '/wizard';
    const { env } = environment(destination);
    const response = await worker.fetch(new Request(origin + '/oauth/callback?code=example', {
      headers: { Cookie: '__Host-extb_install=' + 'a'.repeat(43) },
    }), env);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(destination);
  });
});

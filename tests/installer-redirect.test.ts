import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import worker from '../installer/src/index';
import { releaseVersion, renderWizardPage, resolveWizardLang } from '../installer/src/landing';

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

  it('serves Hebrew when selected and allows an English override', async () => {
    const { env } = environment(origin);
    const hebrew = await worker.fetch(new Request(origin + '/?lang=he'), env);
    expect(await hebrew.text()).toContain('<html lang="he" dir="rtl">');
    const english = await worker.fetch(new Request(origin + '/?lang=en', { headers: { 'Accept-Language': 'he' } }), env);
    expect(await english.text()).toContain('<html lang="en" dir="ltr">');
  });

  it('remembers an explicit landing language for the setup wizard', async () => {
    const { env } = environment(origin);
    const chosen = await worker.fetch(new Request(origin + '/?lang=he'), env);
    expect(chosen.headers.get('Set-Cookie')).toBe('__Host-extb_lang=he; Path=/; Secure; SameSite=Lax; Max-Age=31536000');
    expect((await worker.fetch(new Request(origin + '/'), env)).headers.get('Set-Cookie')).toBeNull();
    const wizard = (cookie: string, accept = 'en') => resolveWizardLang(new Request(origin + '/wizard', { headers: { Cookie: cookie, 'Accept-Language': accept } }));
    expect(wizard('a=1; __Host-extb_lang=he')).toBe('he');
    expect(wizard('__Host-extb_lang=en', 'he')).toBe('en');
    expect(wizard('', 'he-IL')).toBe('he');
  });

  it('shows the pinned release version, or a neutral fallback without one', async () => {
    expect(releaseVersion('https://github.com/royachiron/extb/releases/download/v0.4.1/extb-manifest.json')).toBe('v0.4.1');
    expect(releaseVersion('')).toBe('');
    const pinned = { ...environment(origin).env, RELEASE_MANIFEST_URL: 'https://github.com/royachiron/extb/releases/download/v0.4.1/extb-manifest.json' };
    const html = await (await worker.fetch(new Request(origin + '/'), pinned)).text();
    expect(html).toContain('<strong>v0.4.1</strong>');
    expect(html).toContain('/releases/tag/v0.4.1');
    const unpinned = await (await worker.fetch(new Request(origin + '/'), environment(origin).env)).text();
    expect(unpinned).toContain('/releases/latest');
    expect(unpinned).not.toContain('<code></code>');
  });

  it('offers a way back to an earlier install only to browsers that have one', async () => {
    const { env } = environment(origin);
    const fresh = await (await worker.fetch(new Request(origin + '/'), env)).text();
    expect(fresh).not.toContain('portal-resume');
    const returning = await (await worker.fetch(new Request(origin + '/?lang=he', { headers: { Cookie: '__Host-extb_install=' + 'a'.repeat(43) } }), env)).text();
    expect(returning).toContain('<p class="portal-resume">');
    expect(returning).toContain('href="/wizard"');
  });

  it('starts a separate installation for new=1 instead of resuming the cookie one', async () => {
    const { env } = environment('https://dash.cloudflare.com/oauth2/auth');
    const ids: string[] = [];
    (env.INSTALLATIONS.idFromName as unknown as ReturnType<typeof vi.fn>).mockImplementation((id: string) => { ids.push(id); return id; });
    const existing = 'a'.repeat(43);
    await worker.fetch(new Request(origin + '/oauth/start', { headers: { Cookie: '__Host-extb_install=' + existing } }), env);
    const response = await worker.fetch(new Request(origin + '/oauth/start?new=1', { headers: { Cookie: '__Host-extb_install=' + existing } }), env);
    expect(ids[0]).toBe(existing);
    expect(ids[1]).not.toBe(existing);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-extb_install=' + ids[1]);
  });

  it('keeps unverified feature claims off both landing pages', async () => {
    const { env } = environment(origin);
    for (const lang of ['en', 'he']) {
      const html = await (await worker.fetch(new Request(origin + '/?lang=' + lang), env)).text();
      for (const claim of ['2FA', 'TOTP', 'Sub-Forums', 'תתי־פורומים', '60 Sec', '60 שניות', '&lt;10ms', 'Group DMs', 'trust levels', 'דרגות אמון']) expect(html, lang + ' ' + claim).not.toContain(claim);
    }
  });

  it('renders the setup wizard inside the portal shell in the chosen language', () => {
    const hebrew = renderWizardPage('he');
    expect(hebrew).toContain('<html lang="he" dir="rtl">');
    expect(hebrew).toContain('<main id="app">');
    expect(hebrew).toContain('src="/wizard.js"');
    expect(hebrew).toContain('הקמת קהילה');
    expect(renderWizardPage('en')).toContain('Community Setup');
  });

  it.each(['feed-chat', 'topic-poll', 'admin-cpanel', 'hebrew-rtl'])('ships the %s screenshot as a static PNG asset', (name) => {
    const image = readFileSync(new URL('../installer/public/screenshots/' + name + '.png', import.meta.url));
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
  it('serves the retro-futuristic portal landing page and stylesheet with strict CSP', async () => {
    const { env } = environment(origin);
    const page = await worker.fetch(new Request(origin + '/'), env);
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    const html = await page.text();
    expect(html).toContain('EXTra Board');
    expect(html).toContain('href="/oauth/start?new=1"');
    expect(html).not.toContain('href="/oauth/start"');
    expect(html).toContain('Continue with Cloudflare');
    expect(html).not.toContain('2FA');
    const hebrew = await (await worker.fetch(new Request(origin + '/?lang=he'), env)).text();
    expect(hebrew).toContain('המשך עם Cloudflare');
    expect(hebrew).toContain('href="/oauth/start?new=1"');

    const css = await worker.fetch(new Request(origin + '/wizard.css'), env);
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('.portal-masthead');
  });
});

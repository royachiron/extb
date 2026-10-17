import 'urlpattern-polyfill';
import { describe, it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
vi.stubGlobal('caches', { default: {} });
import { database } from './helpers/sqlite';
import { makeCommunityDraft } from '../src/community/draft';
import { tokenHash } from '../src/lib/invites';
import worker from '../src/index';

const fetchWorker = (env: Parameters<typeof worker.fetch>[1], path: string, init?: RequestInit) =>
  worker.fetch(new Request('https://forum.example' + path, init), env, {} as ExecutionContext);

describe('setup gate before the community exists', { timeout: 40000 }, () => {
  it('sends full-page navigation to setup', async () => {
    const db = database(); try {
      const response = await fetchWorker(db.env, '/chat');
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://forum.example/setup');
    } finally { db.close(); }
  });

  it('serves the static service worker so registration does not fail on a redirect', async () => {
    const db = database(); try {
      const response = await fetchWorker(db.env, '/sw.js');
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('javascript');
    } finally { db.close(); }
  });

  it('answers HTMX requests with no content instead of nesting the setup page', async () => {
    const db = database(); try {
      for (const path of ['/chat', '/', '/tos', '/api/heartbeat']) {
        const response = await fetchWorker(db.env, path, { headers: { 'HX-Request': 'true' } });
        expect(response.status, path).toBe(204);
        expect(await response.text(), path).toBe('');
      }
    } finally { db.close(); }
  });
});

describe('installer owner form', { timeout: 40000 }, () => {
  async function installerSetup(env: Parameters<typeof worker.fetch>[1]) {
    const session = 'b'.repeat(64);
    const draft = makeCommunityDraft({ name: 'Spaces', purpose: 'For all the Space lovers', preset: 'general', language: 'en' });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_draft',?)").bind(JSON.stringify(draft)),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_session_hash',?)").bind(await tokenHash(session)),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_session_expires_at',?)").bind(String(Date.now() + 3600000)),
    ]);
    return { cookie: 'extb_setup=' + session, draft };
  }

  it('explains the username rule and validates it in the browser', async () => {
    const db = database(); try {
      const { cookie } = await installerSetup(db.env);
      const html = await (await fetchWorker(db.env, '/setup', { headers: { Cookie: cookie } })).text();
      expect(html).toContain('pattern="[A-Za-z0-9_\\-]{3,32}"');
      expect(html).toContain('not an email');
    } finally { db.close(); }
  });

  it('shows a specific username error next to the owner form', async () => {
    const db = database(); try {
      const { cookie, draft } = await installerSetup(db.env);
      const body = new URLSearchParams({ csrf: 'csrf-test', username: 'owner@example.com', password: 'Long-enough-42!', approve_draft: '1', approved_draft: JSON.stringify(draft), community_name: draft.name });
      const response = await fetchWorker(db.env, '/setup', { method: 'POST', body, headers: { Cookie: `${cookie}; csrf=csrf-test`, 'Content-Type': 'application/x-www-form-urlencoded' } });
      const html = await response.text();
      expect(response.status).toBe(400);
      const alert = html.indexOf('role="alert"');
      expect(alert).toBeGreaterThan(html.indexOf('action="/setup"'));
      expect(alert).toBeLessThan(html.indexOf('name="username"'));
      expect(html.indexOf('name="username"')).toBeLessThan(html.indexOf('Edit starter content'));
      expect(html).toContain('Username must be 3-32 letters, numbers, _ or - (not an email).');
    } finally { db.close(); }
  });
});

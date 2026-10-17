import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { Installation, updateTarget, compareVersions } from '../installer/src/index';
import { seal, hexDigest } from '../installer/src/security';

const origin = 'https://extb.achiron.fyi', account = 'a'.repeat(32), secret = 'a'.repeat(43), version = 'v1.2.4';
const base = `https://github.com/royachiron/extb/releases/download/${version}/`;
const forumUrl = 'https://extb-old.owner.workers.dev';
afterEach(() => vi.unstubAllGlobals());

async function harness(options: { forumVersion?: string; notExtb?: boolean; workerName?: string } = {}) {
  const migration = 'CREATE TABLE added_in_update(id INTEGER PRIMARY KEY);';
  const release = { version, mainModule: 'index.js', modules: [{ name: 'index.js', url: base + 'index.js', sha256: await hexDigest(new TextEncoder().encode('export default {}').buffer as ArrayBuffer) }], migrations: [{ name: '0001.sql', url: base + '0001.sql', sha256: await hexDigest(new TextEncoder().encode('CREATE TABLE old(id INTEGER);').buffer as ArrayBuffer) }, { name: '0002.sql', url: base + '0002.sql', sha256: await hexDigest(new TextEncoder().encode(migration).buffer as ArrayBuffer) }], assets: { manifest: {}, files: [] } };
  const releaseBytes = JSON.stringify(release), releaseHash = await hexDigest(new TextEncoder().encode(releaseBytes).buffer as ArrayBuffer);
  const stored = new Map<string, unknown>();
  stored.set('session', { expires: Date.now() + 3600000, csrf: 'csrf', subject: 'owner', encryptedToken: await seal('token', secret), accounts: [{ id: 'b'.repeat(32), name: 'Other' }, { id: account, name: 'Owner' }], updateTarget: { url: forumUrl, worker: options.workerName } });
  const storage = { get: async (k: string) => structuredClone(stored.get(k)), put: async (k: string, v: unknown) => { stored.set(k, structuredClone(v)); }, setAlarm: async () => {}, delete: async (k: string) => stored.delete(k) };
  const env = { INSTALLER_ORIGIN: origin, ENCRYPTION_KEY: secret, OAUTH_CLIENT_ID: 'client', INSTALLATIONS: {} as DurableObjectNamespace, OAUTH_SCOPE: 'openid', RELEASE_MANIFEST_URL: base + 'manifest.json', RELEASE_MANIFEST_SHA256: releaseHash };
  const installation = new Installation({ storage } as unknown as DurableObjectState, env);
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const applied = new Set(['0001.sql']);
  const ok = (result: unknown) => Response.json({ success: true, result });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input), method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body instanceof FormData ? JSON.parse(String(init.body.get('metadata'))) : init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === base + 'manifest.json') return new Response(releaseBytes);
    if (url === base + '0002.sql') return new Response(migration);
    if (url === base + 'index.js') return new Response('export default {}');
    if (url.endsWith('/oauth2/revoke')) return new Response(null, { status: 200 });
    if (url.endsWith(`/accounts/${'b'.repeat(32)}/workers/subdomain`)) return ok({ subdomain: 'someone-else' });
    if (url.endsWith(`/accounts/${account}/workers/subdomain`) && method === 'GET') return ok({ subdomain: 'owner' });
    if (url.includes('/workers/scripts/extb-old/settings')) {
      if (!url.includes(account)) return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
      return ok({ bindings: [{ type: 'd1', name: 'DB', id: 'db-id' }, ...(options.notExtb ? [] : [{ type: 'durable_object_namespace', name: 'CHAT_ROOM', class_name: 'ChatRoom' }]), { type: 'plain_text', name: 'BUILD_ID', text: options.forumVersion ?? 'v1.2.3' }, { type: 'secret_text', name: 'VAPID_PRIVATE_KEY' }] });
    }
    if (url.endsWith('/query')) {
      const body = JSON.parse(String(init!.body));
      if (body.batch) { applied.add(body.batch[1].params[0]); return ok(body.batch.map(() => ({ success: true, results: [] }))); }
      if (String(body.sql).startsWith('SELECT name FROM d1_migrations')) return ok([{ success: true, results: applied.has(body.params[0]) ? [{ name: body.params[0] }] : [] }]);
      return ok([{ success: true, results: [] }]);
    }
    if (url.endsWith('/assets-upload-session')) return ok({ jwt: 'asset-jwt', buckets: [] });
    if (url.endsWith(`/accounts/${account}/workers/scripts`) && method === 'GET') return ok([{ id: 'extb-old', migration_tag: 'v1' }]);
    if (url.endsWith('/workers/scripts/extb-old') && method === 'PUT') return ok({});
    if (url.endsWith('/workers/scripts/extb-old/subdomain')) return ok({});
    if (url === forumUrl + '/healthz') return Response.json({ ok: true });
    throw new Error('Unexpected request ' + method + ' ' + url);
  }));
  const run = async () => {
    const response = await installation.fetch(new Request(origin + '/api/update', { method: 'POST', headers: { Origin: origin, 'x-csrf-token': 'csrf' }, body: '{}' }));
    expect(response.status).toBe(202);
    for (let i = 0; i < 8; i++) { await installation.alarm(); const s = stored.get('session') as any; if (s.job.error || s.job.stage === 'complete') return s; }
    throw new Error('Update did not finish');
  };
  return { run, calls, applied, status: async () => (await installation.fetch(new Request(origin + '/api/status'))).json() as Promise<any> };
}

describe('updating an existing forum', () => {
  it('finds the forum, applies only new migrations and redeploys while keeping its bindings', async () => {
    const h = await harness();
    const session = await h.run();
    expect(session.job.error).toBeUndefined();
    expect(session.job).toMatchObject({ stage: 'complete', mode: 'update', account, worker: 'extb-old', database: 'db-id', fromVersion: 'v1.2.3' });
    expect(session.encryptedToken).toBeUndefined();
    expect([...h.applied]).toEqual(['0001.sql', '0002.sql']);
    const put = h.calls.find(c => c.method === 'PUT' && c.url.endsWith('/workers/scripts/extb-old'))!;
    const metadata = put.body as { keep_bindings: string[]; bindings: { type: string; name: string; id?: string; text?: string }[]; migrations?: unknown };
    expect(metadata.keep_bindings).toContain('secret_text');
    expect(metadata.keep_bindings).toContain('r2_bucket');
    expect(metadata.migrations).toBeUndefined();
    expect(metadata.bindings).toContainEqual({ type: 'd1', name: 'DB', id: 'db-id' });
    expect(metadata.bindings).toContainEqual({ type: 'plain_text', name: 'BUILD_ID', text: version });
    expect(metadata.bindings).toContainEqual({ type: 'plain_text', name: 'EXTB_WORKER', text: 'extb-old' });
    // Updating never creates resources or touches ownership and accounts.
    expect(h.calls.some(c => c.method === 'POST' && /\/d1\/database$/.test(c.url))).toBe(false);
    expect(JSON.stringify(h.calls.filter(c => c.url.endsWith('/query')).map(c => c.body))).not.toMatch(/setup_ownership|users/);
    const status = await h.status();
    expect(status).toMatchObject({ mode: 'update', fromVersion: 'v1.2.3', version, stages: ['locate forum', 'migrations', 'Worker deployment', 'readiness'] });
    expect(status.admin).toBeUndefined();
  });

  it('finds a forum on a custom domain by its Worker name', async () => {
    const h = await harness({ workerName: 'extb-old' });
    const session = await h.run();
    expect(session.job).toMatchObject({ stage: 'complete', account, worker: 'extb-old' });
  });

  it('finishes without redeploying when the forum is already current', async () => {
    const h = await harness({ forumVersion: version });
    const session = await h.run();
    expect(session.job).toMatchObject({ stage: 'complete', upToDate: true });
    expect(h.calls.some(c => c.method === 'PUT')).toBe(false);
    expect(h.calls.some(c => c.url.endsWith('/query'))).toBe(false);
  });

  it('refuses downgrades and Workers that are not EXTB forums', async () => {
    const newer = await harness({ forumVersion: 'v9.0.0' });
    expect((await newer.run()).job.error).toContain('Invalid downgrade');
    expect(newer.calls.some(c => c.method === 'PUT')).toBe(false);
    const other = await harness({ notExtb: true });
    expect((await other.run()).job.error).toContain('not an EXTB forum');
  });

  it('accepts only https forum addresses, and non-workers.dev hosts only with a Worker name', () => {
    expect(updateTarget('https://extb-x.owner.workers.dev/admin', null)).toEqual({ url: 'https://extb-x.owner.workers.dev', worker: undefined });
    expect(updateTarget('https://forum.example.com', 'extb-x')).toEqual({ url: 'https://forum.example.com', worker: 'extb-x' });
    for (const bad of ['http://extb-x.owner.workers.dev', 'https://forum.example.com', 'javascript:alert(1)', 'https://u:p@extb-x.owner.workers.dev', 'https://extb-x.owner.workers.dev:8443', '']) expect(updateTarget(bad, null)).toBeNull();
    expect(updateTarget('https://forum.example.com', '../evil')).toBeNull();
    expect(compareVersions('v0.4.3', 'v0.4.10')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
    expect(compareVersions('dev', 'v1.0.0')).toBeNull();
  });

  it('starts an update in its own session and publishes the release forums compare against', async () => {
    const ids: string[] = [];
    const fetch = vi.fn(async (request: Request) => { expect(new URL(request.url).searchParams.get('forum')).toBe(forumUrl); return Response.redirect('https://dash.cloudflare.com/oauth2/auth?state=x', 302); });
    const env = { INSTALLER_ORIGIN: origin, OAUTH_CLIENT_ID: 'client', OAUTH_SCOPE: 'scope', ENCRYPTION_KEY: 'key', RELEASE_MANIFEST_URL: 'https://github.com/royachiron/extb/releases/download/v0.4.3/extb-manifest.json', RELEASE_MANIFEST_SHA256: '',
      INSTALLATIONS: { idFromName: (id: string) => { ids.push(id); return id; }, get: () => ({ fetch }) } } as unknown as Parameters<typeof worker.fetch>[1];
    const response = await worker.fetch(new Request(origin + '/update?forum=' + encodeURIComponent(forumUrl), { headers: { Cookie: '__Host-extb_install=' + 'c'.repeat(43) } }), env);
    expect(response.status).toBe(302);
    expect(ids[0]).not.toBe('c'.repeat(43));
    expect(response.headers.get('Set-Cookie')).toContain('__Host-extb_install=' + ids[0]);
    expect((await worker.fetch(new Request(origin + '/update?forum=http://evil.example'), env)).status).toBe(400);
    expect(await (await worker.fetch(new Request(origin + '/api/latest'), env)).json()).toEqual({ version: 'v0.4.3' });
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Env, AppContext, User } from '../src/types';
import { createInvite, createInvitedUser } from '../src/lib/invites';
import { seedIfNeeded } from '../src/seed';
import { postSetup, postCreateResetLink } from '../src/api/setup';
import { postReset } from '../src/api/auth';
import { verifyPassword } from '../src/auth';
import { canPost } from '../src/access';

const python = `import sqlite3,json,sys
p=json.load(sys.stdin)
c=sqlite3.connect(p['file']);c.row_factory=sqlite3.Row
if 'schema' in p: c.executescript(p['schema'])
r=[]
try:
 for s in p.get('statements',[]):
  q=c.execute(s['sql'],s['binds']); rows=[dict(x) for x in q.fetchall()]
  r.append({'results':rows,'meta':{'changes':c.execute('SELECT changes()').fetchone()[0]}})
 c.commit()
except: c.rollback();raise
print(json.dumps(r))`;

function database() {
  const dir = mkdtempSync(join(tmpdir(), 'extb-core-'));
  const file = join(dir, 'db.sqlite');
  const execute = (statements: { sql: string; binds: unknown[] }[], schema?: string) => JSON.parse(execFileSync('python3', ['-c', python], { input: JSON.stringify({ file, statements, schema }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  execute([], readFileSync(join(process.cwd(), 'schema.sql'), 'utf8'));
  class Statement {
    binds: unknown[] = [];
    constructor(public sql: string) {}
    bind(...binds: unknown[]) { this.binds = binds; return this; }
    async first() { return execute([this])[0].results[0] || null; }
    async run() { return execute([this])[0]; }
    async all() { return execute([this])[0]; }
  }
  const env = { DB: { prepare: (sql: string) => new Statement(sql), batch: async (statements: Statement[]) => execute(statements) }, SETUP_PASSPHRASE: 'a-long-private-setup-passphrase' } as unknown as Env;
  return { env, close: () => rmSync(dir, { recursive: true, force: true }) };
}

function setupRequest(passphrase: string, username = 'Owner') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ csrf: 'test', passphrase, username, password: 'owner-password-123', community_name: 'Our community' })) form.set(key, value);
  return new Request('https://example.workers.dev/setup', { method: 'POST', body: form });
}

function context(env: Env): AppContext { return { env, user: null, csrfToken: 'test', cookies: [] }; }

describe('fresh community installation', () => {
  it('fresh schema prepares every static runtime SQL statement', () => {
    const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? collect(path) : entry.name.endsWith('.ts') ? [path] : [];
    });
    const queries: { path: string; sql: string }[] = [];
    for (const path of collect(join(process.cwd(), 'src'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/\.prepare\(\s*([`'"])([\s\S]*?)\1/g)) {
        if (match[2]!.includes('${')) continue;
        queries.push({ path, sql: match[2]!.replaceAll("\\\\", "\\").replaceAll("\\'", "'").replaceAll('\\"', '"') });
      }
    }
    const verify = `import sqlite3,json,sys
p=json.load(sys.stdin);c=sqlite3.connect(':memory:');c.executescript(p['schema'])
f=[]
for q in p['queries']:
 try:c.execute('EXPLAIN '+q['sql'],[None]*q['sql'].count('?'))
 except Exception as e:f.append(q['path']+': '+str(e))
print(json.dumps(f))`;
    const failures = JSON.parse(execFileSync('python3', ['-c', verify], {
      input: JSON.stringify({ schema: readFileSync(join(process.cwd(), 'schema.sql'), 'utf8'), queries }),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }));
    expect(queries.length).toBeGreaterThan(200);
    expect(failures).toEqual([]);
  });

  it('creates one owner and four empty rooms, keeps setup closed, and persists the private chat secret', async () => {
    const db = database();
    try {
      expect((await postSetup(setupRequest(db.env.SETUP_PASSPHRASE!), context(db.env))).status).toBe(303);
      expect((await postSetup(setupRequest(db.env.SETUP_PASSPHRASE!, 'OtherOwner'), context(db.env))).status).toBe(409);
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).toEqual({ n: 1 });
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM rooms').first()).toEqual({ n: 4 });
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM topics').first()).toEqual({ n: 0 });
      expect(await db.env.DB.prepare('SELECT is_approved, email_verified, email FROM users').first()).toEqual({ is_approved: 1, email_verified: 0, email: null });
      const secret = await db.env.DB.prepare("SELECT value FROM settings WHERE key = 'chat_auth_secret'").first<{ value: string }>();
      expect(secret?.value).toMatch(/^[a-f0-9]{64}$/);
      expect((await seedIfNeeded(db.env)).seeded).toBe(false);
    } finally { db.close(); }
  });

  it('rejects wrong passphrase and CSRF before creating any owner', async () => {
    const db = database();
    try {
      expect((await postSetup(setupRequest('wrong'), context(db.env))).status).toBe(403);
      await expect(postSetup(setupRequest(db.env.SETUP_PASSPHRASE!), { ...context(db.env), csrfToken: 'different' })).rejects.toMatchObject({ status: 403 });
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).toEqual({ n: 0 });
    } finally { db.close(); }
  });

  it('rolls back the setup lock when the admin insert fails', async () => {
    const db = database();
    try {
      await db.env.DB.prepare("INSERT INTO users (display_name, password_hash) VALUES ('Owner', 'existing')").run();
      await expect(postSetup(setupRequest(db.env.SETUP_PASSPHRASE!), context(db.env))).rejects.toThrow();
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").first()).toBe(null);
    } finally { db.close(); }
  });

  it('invites admit username accounts exactly once and reject expired links', async () => {
    const db = database();
    try {
      await db.env.DB.prepare("INSERT INTO users (display_name, password_hash, access_level, is_approved) VALUES ('Admin', 'hash', 'admin', 1)").run();
      const token = await createInvite(db.env, 1);
      const user = await createInvitedUser(db.env, token, 'Member', 'password-hash', 'salt', 1);
      expect(user).toMatchObject({ display_name: 'Member', email: null, email_verified: 0, is_approved: 1 });
      expect(await createInvitedUser(db.env, token, 'Another', 'hash', 'salt', 1)).toBe(null);
      const expired = await createInvite(db.env, 1);
      await db.env.DB.prepare("UPDATE invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE claimed_by IS NULL").run();
      expect(await createInvitedUser(db.env, expired, 'Expired', 'hash', 'salt', 1)).toBe(null);
      const room = { min_post: 'member', min_read: 'anon', is_locked: 0, is_exclusive: 0 } as Parameters<typeof canPost>[1];
      expect(canPost(user, room)).toBe(true);
      expect(canPost({ ...user, is_approved: 0 } as User, room)).toBe(false);
    } finally { db.close(); }
  });

  it('admin reset links target the existing reset-token route', async () => {
    const db = database();
    try {
      await postSetup(setupRequest(db.env.SETUP_PASSPHRASE!), context(db.env));
      const owner = await db.env.DB.prepare('SELECT * FROM users').first<User>();
      const form = new FormData(); form.set('csrf', 'test');
      const req = new Request('https://example.workers.dev/admin/users/1/reset-link', { method: 'POST', body: form });
      const response = await postCreateResetLink(req, { ...context(db.env), user: owner }, { id: '1' });
      expect(response.status).toBe(200);
      const result = await response.json() as { url: string };
      expect(result.url).toMatch(/^https:\/\/example\.workers\.dev\/reset\/[a-f0-9]{64}$/);
      expect(await db.env.DB.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE kind = 'reset'").first()).toEqual({ n: 1 });
    } finally { db.close(); }
  });

  it('resets the password, revokes existing sessions and rejects token replay', async () => {
    const db = database();
    try {
      await postSetup(setupRequest(db.env.SETUP_PASSPHRASE!), context(db.env));
      const owner = await db.env.DB.prepare('SELECT * FROM users').first<User>();
      const createForm = new FormData(); createForm.set('csrf', 'test');
      const response = await postCreateResetLink(new Request('https://example.workers.dev/admin/users/1/reset-link', { method: 'POST', body: createForm }), { ...context(db.env), user: owner }, { id: '1' });
      const result = await response.json() as { url: string };
      const token = new URL(result.url).pathname.split('/').at(-1)!;
      const form = new FormData(); form.set('token', token); form.set('password', 'replacement-password-123');
      const req = () => new Request('https://example.workers.dev/reset', { method: 'POST', body: form });
      expect((await postReset(req(), context(db.env), {})).status).toBe(200);
      const updated = await db.env.DB.prepare('SELECT * FROM users').first<User>();
      expect(await verifyPassword('replacement-password-123', updated!.password_salt!, updated!.password_hash)).toBe(true);
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first()).toEqual({ n: 0 });
      expect((await postReset(req(), context(db.env), {})).status).toBe(400);
    } finally { db.close(); }
  });

  it('a failed invited username leaves the invitation reusable', async () => {
    const db = database();
    try {
      await db.env.DB.prepare("INSERT INTO users (display_name, password_hash) VALUES ('Admin', 'hash')").run();
      const token = await createInvite(db.env, 1);
      await expect(createInvitedUser(db.env, token, 'admin', 'hash', 'salt', 1)).rejects.toThrow();
      expect(await createInvitedUser(db.env, token, 'Available', 'hash', 'salt', 1)).toMatchObject({ display_name: 'Available' });
    } finally { db.close(); }
  });
});

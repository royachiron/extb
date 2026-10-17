// The installer creates the first admin through the real forum setup endpoints, in an ephemeral Miniflare database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { makeCommunityDraft } from '../src/community/draft.ts';
import { adminPassword, createForumAdmin } from '../installer/src/owner.ts';

const token = randomBytes(32).toString('hex');
const draft = makeCommunityDraft({ name: 'Spaces & "Friends"', purpose: 'For all the space lovers', preset: 'general', language: 'he' });
const mf = new Miniflare({
  modules: true, scriptPath: 'dist/worker-bundle/index.js', compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 18788, d1Databases: ['DB'],
  durableObjects: { CHAT_ROOM: { className: 'ChatRoom', useSQLite: true }, PASSWORD_HASHER: { className: 'PasswordHasher', useSQLite: true } },
  serviceBindings: { ASSETS: async () => new Response('Not found', { status: 404 }) }, bindings: { BUILD_ID: 'installer-admin-test' },
});
try {
  await mf.ready;
  const db = await mf.getD1Database('DB');
  const sql = (await readFile('schema.sql', 'utf8')).replace(/--[^\n]*/g, '');
  const triggers = [];
  const remaining = sql.replace(/CREATE TRIGGER[\s\S]*?END;/g, value => { triggers.push(value); return ''; });
  for (const statement of [...remaining.split(';').map(s => s.trim()).filter(Boolean), ...triggers]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_ownership_hash',?)").bind(createHash('sha256').update(token).digest('hex')),
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_ownership_expires_at',?)").bind(String(Date.now() + 600000)),
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_draft',?)").bind(JSON.stringify(draft)),
  ]);
  const origin = 'http://localhost:18788';
  const password = adminPassword();
  await createForumAdmin(origin, token, password);
  const admin = await db.prepare("SELECT access_level FROM users WHERE display_name='admin'").first();
  assert.equal(admin?.access_level, 'admin');
  assert.equal((await db.prepare("SELECT value FROM settings WHERE key='branding_name'").first())?.value, draft.name);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='setup_complete'").first()).n, 1);
  const csrf = crypto.randomUUID();
  const login = await fetch(origin + '/login', { method: 'POST', redirect: 'manual', headers: { Cookie: 'csrf=' + csrf, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, email: 'admin', password }) });
  assert.equal(login.status, 302);
  assert.match(login.headers.get('Set-Cookie') || '', /session=/);
  await assert.rejects(createForumAdmin(origin, token, password), /Forum setup failed \(ownership claim 403\)/);
  console.log('PASS: installer created the admin through the real setup flow, with the approved Hebrew draft, and the generated password logs in.');
} finally { await mf.dispose(); }

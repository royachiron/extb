// A complete ownership setup runs only in an ephemeral local Miniflare database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { chromium } from 'playwright';
import { makeCommunityDraft } from '../src/community/draft.ts';

const token = randomBytes(32).toString('hex');
const draft = makeCommunityDraft({ name: 'Starter Workshop', purpose: 'Learn and share projects', preset: 'project', language: 'en' });
const mf = new Miniflare({
  modules: true, scriptPath: 'dist/worker-bundle/index.js', compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 18787, d1Databases: ['DB'],
  durableObjects: { CHAT_ROOM: { className: 'ChatRoom', useSQLite: true }, PASSWORD_HASHER: { className: 'PasswordHasher', useSQLite: true } },
  serviceBindings: { ASSETS: async request => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/css/') && !path.startsWith('/icons/')) return new Response('Not found', { status: 404 });
    try { return new Response(await readFile('public' + path), { headers: { 'content-type': path.endsWith('.css') ? 'text/css' : 'image/svg+xml' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  } }, bindings: { BUILD_ID: 'installer-browser-test' },
});
let browser;
try {
  await mf.ready;
  const db = await mf.getD1Database('DB');
  const sql = (await readFile('schema.sql', 'utf8')).replace(/--[^\n]*/g, '');
  const triggers = [];
  const remaining = sql.replace(/CREATE TRIGGER[\s\S]*?END;/g, value => { triggers.push(value); return ''; });
  for (const statement of [...remaining.split(';').map(s => s.trim()).filter(Boolean), ...triggers]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_ownership_hash',?)").bind(createHash('sha256').update(token).digest('hex')),
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_ownership_expires_at',?)").bind(String(Date.now() + 3600000)),
    db.prepare("INSERT INTO settings(key,value) VALUES('setup_draft',?)").bind(JSON.stringify(draft)),
  ]);
  const origin = 'http://localhost:18787';
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
  const owner = await browser.newContext();
  const page = await owner.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  assert.equal((await owner.request.get(origin + '/healthz')).status(), 200);
  await page.goto(origin + '/setup#ownership=' + token);
  await page.locator('[name=username]').waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.locator('.community-preview article').count(), 12);
  await page.locator('[name=username]').fill('starter_owner');
  await page.locator('[name=password]').fill('Local-Starter-Owner-42!');
  await page.locator('[name=approve_draft]').check();
  await page.getByRole('button', { name: 'Create community', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/admin');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM topics').first()).n, 5);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 1);
  await page.goto(origin + '/admin/invitations');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const invite = await page.locator('input[readonly]').inputValue();
  const member = await browser.newContext(); const memberPage = await member.newPage();
  await memberPage.goto(invite);
  await memberPage.locator('[name=display_name]').fill('starter_member');
  await memberPage.locator('[name=password]').fill('Local-Starter-Member-42!');
  await memberPage.locator('#tos-pill').click(); await memberPage.locator('#tos-accept').click();
  await memberPage.getByRole('button', { name: 'Create Account' }).click();
  await memberPage.waitForURL(url => url.pathname === '/');
  const room = await db.prepare("SELECT id FROM rooms WHERE slug='general'").first();
  const topic = await memberPage.evaluate(async ({ room }) => {
    const csrf = document.querySelector('[name=csrf]')?.value;
    const response = await fetch('/topics', { method: 'POST', body: new URLSearchParams({ csrf, room_id: String(room.id), title: 'Browser starter post', content: 'A real invited member can contribute.' }) });
    return { status: response.status, url: response.url };
  }, { room });
  assert.equal(topic.status, 200); assert.match(topic.url, /\/t\//);
  await db.batch([
    db.prepare("INSERT INTO rooms(name,slug,kind,min_read,min_post) VALUES('Private','private-smoke','forum','full','full')"),
    db.prepare("INSERT INTO topics(room_id,user_id,title,content,short_id) SELECT id,1,'Private smoke title','Private content','private-smoke' FROM rooms WHERE slug='private-smoke'"),
  ]);
  const guest = await browser.newContext();
  assert.equal((await guest.request.get(origin + '/r/private-smoke', { maxRedirects: 0 })).status(), 302);
  const privateTopic = await db.prepare("SELECT id FROM topics WHERE short_id='private-smoke'").first();
  assert.notEqual((await guest.request.get(origin + '/t/' + privateTopic.id, { maxRedirects: 0 })).status(), 200);
  await memberPage.goto(origin + '/chat');
  const socketResult = await memberPage.evaluate(() => new Promise((resolve, reject) => {
    const ws = new WebSocket(location.origin.replace('http', 'ws') + '/chat/ws?room=chat');
    const timeout = setTimeout(() => { ws.close(); reject(Error('WebSocket handshake timeout')); }, 10000);
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'send', content: 'Real WebSocket starter message' })); };
    ws.onmessage = event => { const message = JSON.parse(event.data); if (message.type === 'message' && message.content === 'Real WebSocket starter message') { clearTimeout(timeout); ws.close(); resolve('delivered'); } };
    ws.onerror = () => { clearTimeout(timeout); reject(Error('WebSocket failed')); };
  }));
  assert.equal(socketResult, 'delivered');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE content='Real WebSocket starter message'").first()).n, 1);
  const ownerUser = await db.prepare("SELECT id FROM users WHERE display_name='starter_owner'").first();
  assert.ok(ownerUser);
  await page.goto(origin + '/admin/tokens');
  await page.locator('[name=name]').fill('Starter smoke');
  await page.locator('input[name=scopes][value=configuration]').check();
  await page.getByRole('button', { name: 'Create token' }).click();
  const mcpToken = await page.locator('[role=status] code').innerText();
  const rpc = (method, params, id) => owner.request.post(origin + '/mcp', { headers: { Authorization: 'Bearer ' + mcpToken, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method, params } });
  const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'starter-smoke', version: '1' } }, 1);
  assert.equal(initialized.status(), 200);
  const tools = await rpc('tools/list', {}, 2);
  assert.equal(tools.status(), 200); assert.match(await tools.text(), /preview_starter_content/);
  await owner.clearCookies(); await page.goto(origin + '/login');
  await page.locator('[name=email]').fill('starter_owner'); await page.locator('[name=password]').fill('Local-Starter-Owner-42!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
  assert.deepEqual(errors, []);
  console.log('PASS: fragment exchange, approved starter setup, owner login, invitation, posting, real WebSocket messaging, MCP configuration and private-room isolation.');
} finally { if (browser) await browser.close(); await mf.dispose(); }

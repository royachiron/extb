import { describe, expect, it } from 'vitest';
import { database } from './helpers/sqlite';
import type { AppContext, User } from '../src/types';
import { getMembershipSettings, postMembershipSettings } from '../src/api/admin/membership-config';
import { postHelperSettings } from '../src/api/admin/settings';
import { getBotPage, getBotPanel } from '../src/api/bot';

async function setup() {
  const db = database();
  await db.env.DB.prepare("INSERT INTO users (id,display_name,password_hash,access_level,is_approved,email_verified) VALUES (1,'Owner','hash','admin',1,1),(2,'Applicant','hash','member',1,1)").run();
  await db.env.DB.prepare("INSERT INTO rooms (id,name,slug,kind,min_read,min_post,is_exclusive) VALUES (1,'Welcome','welcome','forum','member','member',0),(2,'Secret','secret','forum','member','member',1)").run();
  const user = await db.env.DB.prepare('SELECT * FROM users WHERE id=1').first<User>();
  return { ...db, ctx: { env: db.env, user, csrfToken: 'csrf-token', cookies: [] } as AppContext };
}
function post(path: string, values: Record<string, string>) { return new Request('https://example.test' + path, { method: 'POST', body: new URLSearchParams(values) }); }

describe('community settings handlers', () => {
  it('requires admin authorization before data access and CSRF before writes', async () => {
    const db = await setup();
    try {
      const unauthorized = { ...db.ctx, user: { ...db.ctx.user!, access_level: 'member' } as User };
      await expect(getMembershipSettings(new Request('https://example.test/admin/membership-settings'), unauthorized, {})).rejects.toMatchObject({ status: 403 });
      await expect(postMembershipSettings(post('/admin/membership-settings', { enabled: '1' }), db.ctx, {})).rejects.toMatchObject({ status: 403 });
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='membership_config'").first()).toBeNull();
    } finally { db.close(); }
  }, 20000);
  it('validates gate settings and writes one atomic JSON configuration', async () => {
    const db = await setup();
    try {
      const values = { csrf: 'csrf-token', enabled: '1', applicationRoomId: '2', staffUserId: '1' };
      expect((await postMembershipSettings(post('/admin/membership-settings', values), db.ctx, {})).status).toBe(400);
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='membership_config'").first()).toBeNull();
      values.applicationRoomId = '1';
      expect((await postMembershipSettings(post('/admin/membership-settings', values), db.ctx, {})).status).toBe(303);
      const saved = await db.env.DB.prepare("SELECT value FROM settings WHERE key='membership_config'").first<{ value: string }>();
      expect(JSON.parse(saved!.value)).toMatchObject({ enabled: true, applicationRoomId: 1, staffUserId: 1, welcomeEnabled: false, remindersEnabled: false });
      await db.env.DB.prepare('UPDATE users SET allow_dms=0 WHERE id=1').run();
      expect((await postMembershipSettings(post('/admin/membership-settings', values), db.ctx, {})).status).toBe(400);
    } finally { db.close(); }
  }, 20000);
  it('preserves full-page and fragment rendering and escapes configurable guidance', async () => {
    const db = await setup();
    try {
      const full = await getMembershipSettings(new Request('https://example.test/admin/membership-settings'), db.ctx, {});
      expect(await full.text()).toContain('<!doctype html>');
      const fragment = await getMembershipSettings(new Request('https://example.test/admin/membership-settings', { headers: { 'HX-Request': 'true' } }), db.ctx, {});
      expect(await fragment.text()).not.toContain('<!doctype html>');
      const values = { csrf: 'csrf-token', name: '<script>', intro: '<img src=x>', topic: 'Start something', reply: 'Reply respectfully', room: 'Choose a room', quiet: 'Read first' };
      expect((await postHelperSettings(post('/admin/helper-settings', values), db.ctx, {})).status).toBe(303);
      const response = await getBotPanel(new Request('https://example.test/bot/panel?branch=intro'), db.ctx, {});
      const html = await response.text();
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x&gt;');
      expect(html).not.toContain('<img src=x>');
    } finally { db.close(); }
  }, 20000);
  it('blocks disabled helper endpoints and isolates private room metadata', async () => {
    const db = await setup();
    try {
      const member = { ...db.ctx, user: await db.env.DB.prepare('SELECT * FROM users WHERE id=2').first<User>() };
      const response = await getBotPanel(new Request('https://example.test/bot/panel?branch=room'), member, {});
      const html = await response.text();
      expect(html).toContain('/r/welcome');
      expect(html).not.toContain('secret');
      await db.env.DB.prepare("INSERT INTO settings (key,value) VALUES ('bot_enabled','0')").run();
      expect((await getBotPanel(new Request('https://example.test/bot/panel'), member, {})).status).toBe(404);
      expect((await getBotPage(new Request('https://example.test/bot'), member, {})).headers.get('Location')).toBe('/');
    } finally { db.close(); }
  }, 20000);
});

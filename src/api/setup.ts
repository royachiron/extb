import type { AppContext } from '../types';
import { generateSalt, generateToken, hashPasswordForEnv, sessionCookie } from '../auth';
import { requireAdmin, verifyCsrf } from '../middleware';
import { csrfField, esc, renderLayout } from '../views/layout';
import { html, redirect } from '../lib/http';
import { listRooms, createSession, createEmailToken, getUserById } from '../db';
import { starterRoomStatements } from '../seed';
import { createInvite, tokenHash } from '../lib/invites';
import { isValidDisplayName, isValidPassword } from './auth';
import { CURRENT_TOS_VERSION } from '../views/tos';
import { checkRateLimit, getClientIp } from '../lib/rate-limit';

export async function isSetupComplete(ctx: AppContext): Promise<boolean> {
  return !!await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").first();
}

function setupForm(ctx: AppContext, error = ''): string {
  return `<h1>Create your community</h1><p>Your setup passphrase is the secret entered during Cloudflare deployment.</p>
    ${error ? `<p role="alert">${esc(error)}</p>` : ''}<form method="post" action="/setup">${csrfField(ctx)}
    <label>Setup passphrase <input type="password" name="passphrase" required autocomplete="off"></label>
    <label>Admin username <input name="username" required minlength="3" maxlength="32" autocomplete="username"></label>
    <label>Admin password <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
    <label>Community name <input name="community_name" required maxlength="80" value="EXTB"></label>
    <button class="btn" type="submit">Create community</button></form>`;
}

async function setupPage(ctx: AppContext, error = '', status = 200): Promise<Response> {
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms: await listRooms(ctx.env), csrfToken: ctx.csrfToken, title: 'Set up EXTB', body: setupForm(ctx, error) }), status);
}

export async function getSetup(_req: Request, ctx: AppContext): Promise<Response> {
  if (await isSetupComplete(ctx)) return redirect('/');
  if (!ctx.env.SETUP_PASSPHRASE) return html('Configure SETUP_PASSPHRASE in Cloudflare before setup.', 503);
  return setupPage(ctx);
}

export async function postSetup(req: Request, ctx: AppContext): Promise<Response> {
  await verifyCsrf(req, ctx);
  if (await isSetupComplete(ctx)) return html('Setup has already completed.', 409);
  const limit = checkRateLimit(`setup:${getClientIp(req)}`, 5, 15 * 60000);
  if (!limit.ok) return html('Too many attempts. Try again later.', 429);
  const form = await req.formData();
  const passphrase = String(form.get('passphrase') || '');
  const expected = ctx.env.SETUP_PASSPHRASE;
  if (!expected || passphrase.length > 1024) return setupPage(ctx, 'Invalid setup passphrase.', 403);
  const actualHash = await tokenHash(passphrase);
  const expectedHash = await tokenHash(expected);
  let diff = 0;
  for (let i = 0; i < expectedHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  if (diff) return setupPage(ctx, 'Invalid setup passphrase.', 403);
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const name = String(form.get('community_name') || '').trim();
  if (!isValidDisplayName(username) || !isValidPassword(password) || !name || name.length > 80) return setupPage(ctx, 'Check the username, password and community name.', 400);
  const salt = generateSalt();
  const passwordHash = await hashPasswordForEnv(ctx.env, password, salt);
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare("INSERT INTO settings (key, value) SELECT 'setup_complete', CASE WHEN EXISTS (SELECT 1 FROM users WHERE access_level = 'admin') THEN NULL ELSE '1' END"),
      ctx.env.DB.prepare(`INSERT INTO users (display_name, password_hash, password_salt, access_level, is_approved, tos_version)
        VALUES (?, ?, ?, 'admin', 1, ?)`).bind(username, passwordHash, salt, CURRENT_TOS_VERSION),
      ctx.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('chat_auth_secret', ?)").bind(generateToken()),
      ctx.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('branding_name', ?)").bind(name),
      ...starterRoomStatements(ctx.env),
      ctx.env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', 'true')"),
      ctx.env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('bot_enabled', '0')"),
    ]);
  } catch (error) {
    if (await isSetupComplete(ctx)) return html('Setup has already completed.', 409);
    throw error;
  }
  const owner = await ctx.env.DB.prepare('SELECT id FROM users WHERE display_name = ?').bind(username).first<{ id: number }>();
  if (!owner) throw new Error('Owner creation failed');
  const sessionToken = generateToken();
  await createSession(ctx.env, sessionToken, owner.id, new Date(Date.now() + 30 * 86400000).toISOString());
  ctx.cookies.push(sessionCookie(sessionToken, 30));
  return redirect('/admin');
}

export async function postCreateInvite(req: Request, ctx: AppContext): Promise<Response> {
  const admin = requireAdmin(ctx);
  await verifyCsrf(req, ctx);
  const token = await createInvite(ctx.env, admin.id);
  await ctx.env.DB.prepare("INSERT INTO mod_logs (mod_id, action, target_type, details) VALUES (?, 'create_invite', 'invitation', 'Single-use invite expires in seven days')").bind(admin.id).run();
  return Response.json({ url: new URL(`/register?invite=${token}`, req.url).toString(), expiresInDays: 7 });
}

export async function postCreateResetLink(req: Request, ctx: AppContext, params: Record<string, string>): Promise<Response> {
  const admin = requireAdmin(ctx);
  await verifyCsrf(req, ctx);
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !await getUserById(ctx.env, id)) return html('User not found.', 404);
  const token = generateToken();
  await createEmailToken(ctx.env, token, id, 'reset', new Date(Date.now() + 3600000).toISOString());
  await ctx.env.DB.prepare("INSERT INTO mod_logs (mod_id, action, target_type, target_id) VALUES (?, 'create_reset_link', 'user', ?)").bind(admin.id, id).run();
  return Response.json({ url: new URL(`/reset/${token}`, req.url).toString(), expiresInMinutes: 60 });
}

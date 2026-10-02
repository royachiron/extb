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
import { installerSetup, setupAuthorization, ownershipFragmentScript } from '../community/ownership';
import { communityDraftSchema, draftStatements, renderCommunityPreview, type CommunityDraft } from '../community/draft';

export async function isSetupComplete(ctx: AppContext): Promise<boolean> {
  return !!await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").first();
}

function setupForm(ctx: AppContext, error = '', draft?: CommunityDraft): string {
  if (draft) return `${renderCommunityPreview(draft)}
    ${error ? `<p role="alert">${esc(error)}</p>` : ''}
    <details><summary>${draft.language === 'he' ? 'עריכת התוכן' : 'Edit starter content'}</summary><form method="post" action="/setup/preview">${csrfField(ctx)}
    <label>${draft.language === 'he' ? 'תוכן הקהילה' : 'Community draft'} <textarea name="draft" rows="20" required>${esc(JSON.stringify(draft, null, 2))}</textarea></label><button class="btn">${draft.language === 'he' ? 'עדכון התצוגה' : 'Update preview'}</button></form></details>
    <form method="post" action="/setup/personalize">${csrfField(ctx)}<p>${draft.language === 'he' ? 'התאמה אישית באמצעות AI היא אופציונלית ופועלת בחשבון Cloudflare שלכם. Cloudflare מספקת 10,000 נוירונים חינמיים ביום לכל החשבון.' : 'Optional AI personalization runs in your Cloudflare account. Cloudflare provides 10,000 free neurons daily across the account.'}</p><button class="btn">${draft.language === 'he' ? 'התאמה אישית / יצירה מחדש (עד שלושה ניסיונות)' : 'Personalize / regenerate (up to three attempts)'}</button></form>
    <form method="post" action="/setup">${csrfField(ctx)}
    <label>${draft.language === 'he' ? 'שם משתמש' : 'Owner username'} <input name="username" required minlength="3" maxlength="32" autocomplete="username"></label>
    <label>${draft.language === 'he' ? 'סיסמה' : 'Owner password'} <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
    <input type="hidden" name="community_name" value="${esc(draft.name)}"><input type="hidden" name="approved_draft" value="${esc(JSON.stringify(draft))}">
    <label><input type="checkbox" name="approve_draft" value="1" required> ${draft.language === 'he' ? 'אני מאשר/ת את התוכן המוצג' : 'I approve this starter content'}</label>
    <button class="btn" type="submit">${draft.language === 'he' ? 'יצירת הקהילה' : 'Create community'}</button></form>`;
  return `<h1>Create your community</h1><p>Your setup passphrase is the secret entered during Cloudflare deployment.</p>
    ${error ? `<p role="alert">${esc(error)}</p>` : ''}<form method="post" action="/setup">${csrfField(ctx)}
    <label>Setup passphrase <input type="password" name="passphrase" required autocomplete="off"></label>
    <label>Admin username <input name="username" required minlength="3" maxlength="32" autocomplete="username"></label>
    <label>Admin password <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
    <label>Community name <input name="community_name" required maxlength="80" value="EXTB"></label>
    <button class="btn" type="submit">Create community</button></form>`;
}

async function storedDraft(ctx: AppContext): Promise<CommunityDraft | undefined> {
  const row = await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = 'setup_draft'").first<{ value: string }>();
  if (!row) return undefined;
  return communityDraftSchema.parse(JSON.parse(row.value));
}

async function setupPage(ctx: AppContext, error = '', status = 200, draft?: CommunityDraft, claim = false): Promise<Response> {
  const body = claim ? `<h1>Open your community</h1><p id="ownership-status">Return to the installer to open your secure ownership link.</p>${csrfField(ctx)}${ownershipFragmentScript}` : setupForm(ctx, error, draft);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms: await listRooms(ctx.env), csrfToken: ctx.csrfToken, title: 'Set up EXTB', body }), status);
}

export async function getSetup(req: Request, ctx: AppContext): Promise<Response> {
  if (await isSetupComplete(ctx)) return redirect('/');
  if (await installerSetup(ctx)) {
    if (!await setupAuthorization(req, ctx)) return setupPage(ctx, '', 200, undefined, true);
    const draft = await storedDraft(ctx);
    if (!draft) return html('The installer has not provided an approved draft.', 503);
    return setupPage(ctx, '', 200, draft);
  }
  if (!ctx.env.SETUP_PASSPHRASE) return html('Configure SETUP_PASSPHRASE in Cloudflare before setup.', 503);
  return setupPage(ctx);
}

export async function postSetup(req: Request, ctx: AppContext): Promise<Response> {
  await verifyCsrf(req, ctx);
  if (await isSetupComplete(ctx)) return html('Setup has already completed.', 409);
  const limit = checkRateLimit(`setup:${getClientIp(req)}`, 5, 15 * 60000);
  if (!limit.ok) return html('Too many attempts. Try again later.', 429);
  const form = await req.formData();
  const installed = await installerSetup(ctx);
  const authorization = installed ? await setupAuthorization(req, ctx) : null;
  if (installed && !authorization) return html('Invalid or expired ownership authorization.', 403);
  const draft = installed ? await storedDraft(ctx) : undefined;
  if (installed && (!draft || form.get('approve_draft') !== '1' || form.get('approved_draft') !== JSON.stringify(draft))) return setupPage(ctx, 'Approve the preview before creating your community.', 400, draft);
  const passphrase = String(form.get('passphrase') || '');
  const expected = ctx.env.SETUP_PASSPHRASE;
  if (!installed) {
    if (!expected || passphrase.length > 1024) return setupPage(ctx, 'Invalid setup passphrase.', 403);
    const actualHash = await tokenHash(passphrase);
    const expectedHash = await tokenHash(expected);
    let diff = 0;
    for (let i = 0; i < expectedHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    if (diff) return setupPage(ctx, 'Invalid setup passphrase.', 403);
  }
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const name = draft?.name || String(form.get('community_name') || '').trim();
  if (!isValidDisplayName(username) || !isValidPassword(password) || !name || name.length > 80) return setupPage(ctx, 'Check the username, password and community name.', 400, draft);
  const salt = generateSalt();
  const passwordHash = await hashPasswordForEnv(ctx.env, password, salt);
  const nextOwner = await ctx.env.DB.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM users').first<{ id: number }>();
  const ownerId = nextOwner!.id;
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO settings (key, value) SELECT 'setup_complete', CASE WHEN
        EXISTS (SELECT 1 FROM users WHERE access_level = 'admin')
        OR (? = 1 AND (NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_draft' AND value = ?)
        OR NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_hash' AND value = ?)
        OR NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_expires_at' AND CAST(value AS INTEGER) > ?)))
        THEN NULL ELSE '1' END`).bind(Number(installed), draft ? JSON.stringify(draft) : '', authorization?.hash || '', Date.now()),
      ...(authorization ? [ctx.env.DB.prepare(`UPDATE settings SET value = CASE WHEN value = ? AND
        EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_expires_at' AND CAST(value AS INTEGER) > ?)
        THEN 'consumed' ELSE NULL END WHERE key = 'setup_session_hash'`).bind(authorization.hash, Date.now())] : []),
      ctx.env.DB.prepare(`INSERT INTO users (id, display_name, password_hash, password_salt, access_level, is_approved, tos_version)
        VALUES (?, ?, ?, ?, 'admin', 1, ?)`).bind(ownerId, username, passwordHash, salt, CURRENT_TOS_VERSION),
      ctx.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('chat_auth_secret', ?)").bind(generateToken()),
      ctx.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('branding_name', ?)").bind(name),
      ...(draft ? draftStatements(ctx.env, draft, ownerId) : starterRoomStatements(ctx.env)),
      ctx.env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', 'true')"),
      ctx.env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('bot_enabled', '0')"),
      ...(draft ? [ctx.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('signups_open', '0')"),
        ctx.env.DB.prepare("DELETE FROM settings WHERE key IN ('setup_session_hash', 'setup_session_expires_at', 'setup_draft', 'setup_ownership_hash', 'setup_ownership_expires_at')")] : []),
    ]);
  } catch (error) {
    if (await isSetupComplete(ctx)) return html('Setup has already completed.', 409);
    if (installed && !await setupAuthorization(req, ctx)) return html('Invalid or expired ownership authorization.', 403);
    if (draft && JSON.stringify(await storedDraft(ctx)) !== JSON.stringify(draft)) return setupPage(ctx, 'The draft changed. Review it again before approving.', 409, await storedDraft(ctx));
    throw error;
  }
  const owner = await ctx.env.DB.prepare('SELECT id FROM users WHERE display_name = ?').bind(username).first<{ id: number }>();
  if (!owner) throw new Error('Owner creation failed');
  const sessionToken = generateToken();
  await createSession(ctx.env, sessionToken, owner.id, new Date(Date.now() + 30 * 86400000).toISOString());
  ctx.cookies.push(sessionCookie(sessionToken, 30));
  if (installed) ctx.cookies.push('extb_setup=; Path=/setup; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
  return redirect('/admin');
}

export async function postSetupPreview(req: Request, ctx: AppContext): Promise<Response> {
  await verifyCsrf(req, ctx);
  const auth = await setupAuthorization(req, ctx);
  if (!auth) return html('Invalid or expired ownership authorization.', 403);
  const form = await req.formData();
  let draft: CommunityDraft;
  try { draft = communityDraftSchema.parse(JSON.parse(String(form.get('draft') || ''))); }
  catch { return setupPage(ctx, 'Invalid community draft.', 400, await storedDraft(ctx)); }
  const update = await ctx.env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'setup_draft'
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_complete')
    AND EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_hash' AND value = ?)
    AND EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_expires_at' AND CAST(value AS INTEGER) > ?)`).bind(JSON.stringify(draft), auth.hash, Date.now()).run();
  if (!update.meta.changes) return html('Invalid or expired ownership authorization.', 403);
  return setupPage(ctx, '', 200, draft);
}

export async function postSetupPersonalize(req: Request, ctx: AppContext): Promise<Response> {
  await verifyCsrf(req, ctx);
  const auth = await setupAuthorization(req, ctx);
  if (!auth) return html('Invalid or expired ownership authorization.', 403);
  const draft = await storedDraft(ctx);
  if (!draft) return html('Missing community draft.', 503);
  const { personalizeCommunity } = await import('../community/ai');
  const attempts = await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = 'setup_ai_attempts'").first<{ value: string }>();
  const result = await personalizeCommunity(ctx.env, { name: draft.name, purpose: draft.purpose, preset: draft.preset, language: draft.language }, Number(attempts?.value || 0) > 0);
  const chosen = result.source === 'template' ? draft : result.draft;
  const updated = await ctx.env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'setup_draft' AND value = ?
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_complete')
    AND EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_hash' AND value = ?)
    AND EXISTS (SELECT 1 FROM settings WHERE key = 'setup_session_expires_at' AND CAST(value AS INTEGER) > ?)`).bind(JSON.stringify(chosen), JSON.stringify(draft), auth.hash, Date.now()).run();
  if (!await setupAuthorization(req, ctx)) return html('Invalid or expired ownership authorization.', 403);
  return setupPage(ctx, result.source === 'template' ? 'Ready-made content retained. AI personalization is unavailable.' : '', 200, updated.meta.changes ? chosen : await storedDraft(ctx));
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

import { decorateMembershipUser, isIntakeRestricted } from '../lib/membership-policy';
import { createInvitedUser } from '../lib/invites';
import type { AppContext, User } from '../types';
import {
  getUserByEmail, getUserById, getUserByDisplayName,
  createUser, updateUserPasswordWithSalt, setEmailVerified, updateUserProfile,
  updateUserTosVersion,
  createEmailToken, consumeEmailToken,
  createSession, deleteSession,
  createBanAppeal, listRooms,
  getSetting,
  isEmailBanned,
} from '../db';
import {
  hashPasswordForEnv, verifyPasswordForEnv,
  generateToken, generateSalt, sessionCookie, clearCookie,
} from '../auth';
import { sendVerifyEmail, sendResetEmail } from '../email';
import { requireMember, parseCookies } from '../middleware';
import { html, redirect as httpRedirect } from '../lib/http';
import {
  renderRegister, renderLogin, renderVerifySent,
  renderResetRequest, renderResetSent, renderResetForm, renderResetDone,
  renderProfileSetup, renderAppeal, renderOnboarding,
} from '../views/auth';
import { renderLayout } from '../views/layout';
import { CURRENT_TOS_VERSION } from '../views/tos';
import { verifyTurnstile } from '../lib/turnstile';
import { checkRateLimit, getClientIp } from '../lib/rate-limit';

// ---------- validators (exported for tests) ----------

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DISPLAY_NAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function isValidEmail(v: string): boolean {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}
export function isValidPassword(v: string): boolean {
  return typeof v === 'string' && v.length >= 8 && v.length <= 256;
}
export function isValidDisplayName(v: string): boolean {
  return typeof v === 'string' && DISPLAY_NAME_RE.test(v);
}

// ---------- constants / helpers ----------

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// auth.ts historically replies 302 Found, not 303 - preserved exactly.
const redirect = (location: string): Response => httpRedirect(location, 302);

async function authPage(ctx: AppContext, title: string, body: string, status = 200): Promise<Response> {
  const rooms = await listRooms(ctx.env);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title, body, csrfToken: ctx.csrfToken }), status);
}

function tooMany(retryAfterMs: number): Response {
  return new Response(
    'Too many attempts. Please wait a moment and try again.',
    {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      },
    },
  );
}

const HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function nowPlusMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function readForm(req: Request): Promise<FormData> {
  return await req.formData();
}

function s(v: string | File | null): string {
  return typeof v === 'string' ? v : '';
}

export async function isRegistrationOpen(env: AppContext['env']): Promise<boolean> {
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM_ADDRESS) return false;
  const setting = await getSetting(env, 'signups_open');
  return setting?.value !== '0';
}

// ---------- handlers ----------

export async function postRegister(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  let invite = '';
  try {
    const ip = getClientIp(req);
    const siteKey = ctx.env.TURNSTILE_SITE_KEY;

    const form = await readForm(req);
    invite = s(form.get('invite'));
    const displayName = s(form.get('display_name')).trim();
    if (!invite && !(await isRegistrationOpen(ctx.env))) {
      return authPage(ctx, 'Register', renderRegister({ invite, error: 'Registration is currently closed.', csrfToken: ctx.csrfToken, siteKey }), 403);
    }

    // Account-creation rate limit: 5/hour/IP. Stops mass-signup bots from
    // burning through email-verification quotas.
    const ipLimit = checkRateLimit(`register:ip:${ip}`, 5, HOUR_MS);
    if (!ipLimit.ok) return tooMany(ipLimit.retryAfterMs);

    const email = s(form.get('email')).trim().toLowerCase();
    const password = s(form.get('password'));
    const isAdult = s(form.get('is_adult')) === 'on';
    const acceptedVersion = parseInt(s(form.get('tos_accepted_version')), 10);

    // Turnstile after rate-limit so bots that flood pre-CAPTCHA still get
    // blocked, but after form parse so we have the token.
    const tsToken = s(form.get('cf-turnstile-response'));
    if (!(await verifyTurnstile(ctx.env, tsToken, ip))) {
      return authPage(ctx, 'Register', renderRegister({ invite, error: 'CAPTCHA verification failed. Please refresh and try again.', csrfToken: ctx.csrfToken, siteKey }), 403);
    }

    if (!isValidDisplayName(displayName)) return authPage(ctx, 'Register', renderRegister({ invite, error: 'Choose a username with 3-32 letters, numbers, underscores or hyphens.', csrfToken: ctx.csrfToken }), 400);
    if (!invite && !isValidEmail(email)) return authPage(ctx, 'Register', renderRegister({ invite, error: 'Invalid email address.', csrfToken: ctx.csrfToken, siteKey }), 400);
    if (!isValidPassword(password)) return authPage(ctx, 'Register', renderRegister({ invite, error: 'Password must be at least 8 characters.', csrfToken: ctx.csrfToken, siteKey }), 400);
    if (acceptedVersion !== CURRENT_TOS_VERSION) {
      return authPage(ctx, 'Register', renderRegister({ invite, error: 'You must read and accept the Community Guidelines to register.', csrfToken: ctx.csrfToken, siteKey }), 400);
    }

    const existing = await getUserByDisplayName(ctx.env, displayName) || (email ? await getUserByEmail(ctx.env, email) : null);
    if (existing) return authPage(ctx, 'Register', renderRegister({ invite, error: 'That username or email is already registered.', csrfToken: ctx.csrfToken, siteKey }), 400);

    const banned = email && await isEmailBanned(ctx.env, email);
    if (banned) return authPage(ctx, 'Register', renderRegister({ invite, error: 'That email is not eligible for registration.', csrfToken: ctx.csrfToken, siteKey }), 400);

    // Per-user salt: new accounts always get a unique random salt. A DB
    // leak forces an attacker to attack each hash individually instead of
    // building one rainbow table for the whole user base.
    const salt = generateSalt();
    const password_hash = await hashPasswordForEnv(ctx.env, password, salt);
    if (invite) {
      const user = await createInvitedUser(ctx.env, invite, displayName, password_hash, salt, CURRENT_TOS_VERSION, isAdult ? 1 : 0);
      if (!user) return authPage(ctx, 'Register', renderRegister({ invite, error: 'Invitation is invalid, expired, or already used.', csrfToken: ctx.csrfToken }), 400);
      const sessionToken = generateToken();
      await createSession(ctx.env, sessionToken, user.id, nowPlusMs(SESSION_TTL_MS));
      ctx.cookies.push(sessionCookie(sessionToken, SESSION_TTL_DAYS));
      return redirect(isIntakeRestricted(await decorateMembershipUser(ctx.env, user)) ? '/membership' : '/');
    }
    const user = await createUser(ctx.env, email, password_hash, isAdult ? 1 : 0, CURRENT_TOS_VERSION, salt, displayName);

    const token = generateToken();
    await createEmailToken(ctx.env, token, user.id, 'verify', nowPlusMs(VERIFY_TTL_MS));

    await sendVerifyEmail(ctx.env, email, token);
    return redirect(`/verify-sent?email=${encodeURIComponent(email)}`);
  } catch (e) {
    console.error('postRegister error', e);
    return authPage(ctx, 'Register', renderRegister({ invite, error: 'Registration temporarily unavailable. Please try again later.', csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY }), 500);
  }
}

export async function postResendVerification(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const ip = getClientIp(req);
  // IP-keyed cap stops one host email-bombing many addresses.
  const ipLimit = checkRateLimit(`resend:ip:${ip}`, 10, HOUR_MS);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterMs);

  const form = await readForm(req);
  const email = s(form.get('email')).trim().toLowerCase();

  const tsToken = s(form.get('cf-turnstile-response'));
  if (!(await verifyTurnstile(ctx.env, tsToken, ip))) {
    return new Response('CAPTCHA verification failed.', { status: 403 });
  }

  if (isValidEmail(email)) {
    // Per-email cap stops targeted email-bombing of a single account.
    const emailLimit = checkRateLimit(`resend:email:${email}`, 3, HOUR_MS);
    if (!emailLimit.ok) return tooMany(emailLimit.retryAfterMs);

    const user = await getUserByEmail(ctx.env, email);
    if (user && !user.email_verified) {
      const token = generateToken();
      await createEmailToken(ctx.env, token, user.id, 'verify', nowPlusMs(VERIFY_TTL_MS));
      await sendVerifyEmail(ctx.env, email, token);
    }
  }
  return redirect(`/verify-sent?email=${encodeURIComponent(email)}`);
}

export async function getVerify(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) return authPage(ctx, 'Log in', renderLogin({ error: 'Verification link is invalid.', csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY }), 400);

  const row = await consumeEmailToken(ctx.env, token, 'verify');
  if (!row) return authPage(ctx, 'Log in', renderLogin({ error: 'Verification link is invalid or expired.', csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY }), 400);
  const userId = row.user_id;

  await setEmailVerified(ctx.env, userId);

  const sessionToken = generateToken();
  await createSession(ctx.env, sessionToken, userId, nowPlusMs(SESSION_TTL_MS));
  ctx.cookies.push(sessionCookie(sessionToken, SESSION_TTL_DAYS));

  const user = await getUserById(ctx.env, userId);
  if (!user) return redirect('/');

  if (!user?.display_name) return redirect('/profile-setup');
  return redirect(isIntakeRestricted(await decorateMembershipUser(ctx.env, user)) ? '/membership' : '/');
}

export async function postLogin(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const ip = getClientIp(req);
  const siteKey = ctx.env.TURNSTILE_SITE_KEY;

  const form = await readForm(req);
  const email = s(form.get('email')).trim().toLowerCase();
  const password = s(form.get('password'));

  // Per-(IP+email) sliding window: 8 attempts per 15min. Covers both
  // credential-stuffing across IPs (email key) and brute-force from one IP
  // (IP key, combined). Real users almost never need >8 attempts in 15min.
  const limit = checkRateLimit(`login:${ip}:${email}`, 8, FIFTEEN_MIN_MS);
  if (!limit.ok) return tooMany(limit.retryAfterMs);

  // Turnstile verify uses the same helper as topics/posts (also short-
  // circuits when TURNSTILE_SECRET is unset, so dev/tests keep working).
  const tsToken = s(form.get('cf-turnstile-response'));
  if (!(await verifyTurnstile(ctx.env, tsToken, ip))) {
    return authPage(ctx, 'Log in', renderLogin({ error: 'CAPTCHA verification failed. Please refresh and try again.', csrfToken: ctx.csrfToken, siteKey }), 403);
  }

  let user: User | null = null;
  if (isValidEmail(email)) {
    user = await getUserByEmail(ctx.env, email);
  } else {
    // If they typed a username, look them up by display name (case-insensitive)
    user = await getUserByDisplayName(ctx.env, email);
  }

  if (!user) return authPage(ctx, 'Log in', renderLogin({ error: 'Invalid email or password.', csrfToken: ctx.csrfToken, siteKey }), 400);

  // Per-user salt with lazy migration:
  //   - New users have user.password_salt populated -> verify against it.
  //   - Legacy users have user.password_salt = NULL -> verify against the
  //     global env.PASSWORD_SALT, and on success rehash with a fresh
  //     per-user salt so the next login uses the new path. Failed logins
  //     never trigger rehash (no info disclosure either direction).
  const saltForVerify = user.password_salt ?? ctx.env.PASSWORD_SALT;
  if (!saltForVerify) return authPage(ctx, 'Log in', renderLogin({ error: 'Contact your administrator to reset your password.', csrfToken: ctx.csrfToken, siteKey }), 400);
  const ok = await verifyPasswordForEnv(ctx.env, password, saltForVerify, user.password_hash);
  if (!ok) return authPage(ctx, 'Log in', renderLogin({ error: 'Invalid email or password.', csrfToken: ctx.csrfToken, siteKey }), 400);

  if (!user.password_salt) {
    const newSalt = generateSalt();
    const newHash = await hashPasswordForEnv(ctx.env, password, newSalt);
    await updateUserPasswordWithSalt(ctx.env, user.id, newHash, newSalt);
  }

  const sessionToken = generateToken();
  await createSession(ctx.env, sessionToken, user.id, nowPlusMs(SESSION_TTL_MS));
  ctx.cookies.push(sessionCookie(sessionToken, SESSION_TTL_DAYS));

  if (user.is_banned) return redirect('/appeal');

  if (!user.display_name) return redirect('/profile-setup');
  return redirect(isIntakeRestricted(await decorateMembershipUser(ctx.env, user)) ? '/membership' : '/');
}

export async function getAppeal(
  _req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return redirect('/login');
  if (!ctx.user.is_banned) return redirect('/');
  
  const rooms = await listRooms(ctx.env);
  const body = renderAppeal({ csrfToken: ctx.csrfToken });
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Appeal Suspension', body, csrfToken: ctx.csrfToken }));
}

export async function postAppeal(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user || !ctx.user.is_banned) return redirect('/');
  const form = await readForm(req);
  const note = s(form.get('reason') || form.get('note')).trim();
  if (note.length < 50) return html('Appeal must be at least 50 characters.', 400);
  
  await createBanAppeal(ctx.env, ctx.user.id, note);
  return html('Appeal submitted. A moderator will review it.');
}

export async function postAcceptTos(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  if (!ctx.user) return redirect('/login');
  const form = await readForm(req);
  const acceptedVersion = parseInt(s(form.get('tos_accepted_version')), 10);
  if (acceptedVersion !== CURRENT_TOS_VERSION) {
    return html('Invalid TOS version.', 400);
  }
  await updateUserTosVersion(ctx.env, ctx.user.id, CURRENT_TOS_VERSION);
  const returnTo = s(form.get('return_to')) || '/';
  // Prevent open redirect: only allow same-origin paths.
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return redirect(safe);
}

export async function postLogout(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const cookies = parseCookies(req.headers.get('Cookie'));
  const token = cookies['session'];
  if (token) await deleteSession(ctx.env, token);
  ctx.cookies.push(clearCookie());
  return redirect('/');
}

export async function postResetRequest(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const ip = getClientIp(req);
  // IP-keyed cap stops one host flooding many addresses with reset emails.
  const ipLimit = checkRateLimit(`reset:ip:${ip}`, 10, HOUR_MS);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterMs);

  const form = await readForm(req);
  const email = s(form.get('email')).trim().toLowerCase();

  const tsToken = s(form.get('cf-turnstile-response'));
  if (!(await verifyTurnstile(ctx.env, tsToken, ip))) {
    return new Response('CAPTCHA verification failed.', { status: 403 });
  }

  // Always render the same page to avoid account enumeration.
  let user: User | null = null;
  if (isValidEmail(email)) {
    // Per-email cap stops targeted reset-email bombing of one account.
    const emailLimit = checkRateLimit(`reset:email:${email}`, 3, HOUR_MS);
    if (!emailLimit.ok) return tooMany(emailLimit.retryAfterMs);
    user = await getUserByEmail(ctx.env, email);
  } else {
    user = await getUserByDisplayName(ctx.env, email);
    if (user && user.email) {
      const emailLimit = checkRateLimit(`reset:email:${user.email}`, 3, HOUR_MS);
      if (!emailLimit.ok) return tooMany(emailLimit.retryAfterMs);
    }
  }

  if (user && user.email && ctx.env.BREVO_API_KEY && ctx.env.EMAIL_FROM_ADDRESS) {
    const token = generateToken();
    await createEmailToken(ctx.env, token, user.id, 'reset', nowPlusMs(RESET_TTL_MS));
    await sendResetEmail(ctx.env, user.email, token);
  }

  return html(renderResetSent());
}

export async function postReset(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const form = await readForm(req);
  const token = s(form.get('token'));
  const password = s(form.get('password'));

  if (!token) return html(renderResetForm(token, 'Reset link is invalid.', ctx.csrfToken), 400);
  if (!isValidPassword(password)) return html(renderResetForm(token, 'Password must be at least 8 characters.', ctx.csrfToken), 400);

  const row = await consumeEmailToken(ctx.env, token, 'reset');
  if (!row) return html(renderResetForm(token, 'Reset link is invalid or expired.', ctx.csrfToken), 400);
  const userId = row.user_id;

  // Password reset always issues a fresh per-user salt - no point reusing
  // the old one (the user already proved control via the reset token).
  const newSalt = generateSalt();
  const password_hash = await hashPasswordForEnv(ctx.env, password, newSalt);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(password_hash, newSalt, userId),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ]);

  return html(renderResetDone());
}

export async function postProfileSetup(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  // NOTE: do NOT use requireMember here - it redirects users with no display_name
  // back to /profile-setup, which is the page this POST submits → infinite loop.
  // This endpoint exists to SET display_name, so a null display_name is expected.
  if (!ctx.user) throw redirect('/login');
  if (ctx.user.is_banned) throw redirect('/appeal');
  if (!ctx.user.is_approved) throw redirect('/verify-sent');
  const user = ctx.user;

  // Immutable once set.
  if (user.display_name) {
    return html(renderProfileSetup({ error: 'Display name is already set and cannot be changed.', user, csrfToken: ctx.csrfToken }), 403);
  }

  const form = await readForm(req);
  const display_name = s(form.get('display_name')).trim();
  const bio = s(form.get('bio')).trim().slice(0, 500);
  const RANDOM_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#06b6d4','#8b5cf6','#ec4899','#64748b','#0ea5e9','#22c55e','#a855f7','#f97316'];
  const avatar_color: string = user.avatar_color && /^#[0-9a-fA-F]{6}$/.test(user.avatar_color)
    ? user.avatar_color
    : (RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)] || '#6366f1');
  const timezone = s(form.get('timezone')).trim() || 'UTC';
  const pronouns = s(form.get('pronouns')).trim().slice(0, 20) || null;
  const twitter_url = s(form.get('twitter_url')).trim().slice(0, 100) || null;
  const website_url = s(form.get('website_url')).trim().slice(0, 100) || null;

  if (!isValidDisplayName(display_name)) {
    return html(renderProfileSetup({ error: 'Display name must be 3-32 chars, letters/numbers/underscore/hyphen only.', user, csrfToken: ctx.csrfToken }), 400);
  }

  const clash = await getUserByDisplayName(ctx.env, display_name);
  if (clash) {
    return html(renderProfileSetup({ error: 'That display name is taken.', user, csrfToken: ctx.csrfToken }), 400);
  }

  try {
    await updateUserProfile(ctx.env, user.id, display_name, bio, avatar_color, timezone, pronouns, twitter_url, website_url, null, 0, 0, null, 1, null, 0);

  } catch (err) {
    console.error('Profile setup failed:', err);
    return html(renderProfileSetup({ error: 'Failed to save profile. Please try again.', user, csrfToken: ctx.csrfToken }), 500);
  }

  return redirect(isIntakeRestricted(user) ? '/membership' : '/');
}

export async function getOnboarding(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return redirect('/login');
  if (isIntakeRestricted(ctx.user)) return redirect('/membership');
  if (ctx.user.access_level !== 'member') return redirect('/');
  
  const rooms = await listRooms(ctx.env, ctx.user.id);
  const body = renderOnboarding();
  if (req.headers.get('hx-request') === 'true') return html(body);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Welcome', body, csrfToken: ctx.csrfToken }));
}

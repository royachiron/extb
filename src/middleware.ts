import type { AppContext, Env, User } from './types';
import { getSessionUser, getSetting } from './db';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    if (name in out) continue;
    out[name] = value;
  }
  return out;
}

export async function resolveSession(
  req: Request,
  env: Env,
  ctx: AppContext
): Promise<User | null> {
  const cookies = parseCookies(req.headers.get('Cookie'));
  
  // Handle CSRF token
  let csrfToken = cookies['csrf'];
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    ctx.cookies.push(`csrf=${csrfToken}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }
  ctx.csrfToken = csrfToken;

  const token = cookies['session'];
  if (!token) return null;
  const user = await getSessionUser(env, token);
  return user;
}

export async function verifyCsrf(req: Request, ctx: AppContext) {

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;

  let sent = req.headers.get('x-csrf-token');

  if (!sent) {
    const ct = req.headers.get('content-type');
    if (ct?.includes('application/json')) {
      const body = await req.clone().json().catch(() => ({})) as { csrf?: string };
      sent = body.csrf ?? null;
    } else {
      const fd = await req.clone().formData().catch(() => null);
      sent = fd?.get('csrf') as string;
    }
  }

  if (!sent || sent !== ctx.csrfToken) {
    throw new Response('CSRF Validation Failed', { status: 403 });
  }
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function forbidden(): Response {
  return new Response('Forbidden', { status: 403 });
}

/**
 * Onboarding gate shared by chat/topics/search handlers, moved from api/auth.ts.
 * Emits 302 (auth's historical status), matching the local redirect() above.
 */
export function onboardingRedirect(ctx: AppContext, exempt?: boolean): Response | null {
  if (!ctx.user) return null;
  if (!ctx.user.display_name) return redirect('/profile-setup');
  if (exempt) return null;
  return null;
}

export function requireMember(ctx: AppContext): User {
  if (!ctx.user) throw redirect('/login');
  if (ctx.user.is_banned) throw redirect('/appeal');
  if (!ctx.user.is_approved) throw redirect('/verify-sent');
  if (!ctx.user.display_name) throw redirect('/profile-setup');
  return ctx.user;
}

export function requireFull(ctx: AppContext): User {
  const u = requireMember(ctx);
  if (u.access_level === 'full' || u.access_level === 'mod' || u.access_level === 'admin') {
    return u;
  }
  throw redirect('/r/introductions');
}

export function requireMod(ctx: AppContext): User {
  const u = requireMember(ctx);
  if (u.access_level !== 'mod' && u.access_level !== 'admin') throw forbidden();
  return u;
}

export function requireAdmin(ctx: AppContext): User {
  const u = requireMember(ctx);
  if (u.access_level !== 'admin') throw forbidden();
  return u;
}

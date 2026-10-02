import type { Env } from '../types';

// Moved verbatim from api/questions.ts - pure siteverify call, no api coupling.

export async function verifyTurnstile(
  env: Env,
  token: string,
  ip: string | null
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // disabled
  if (!token) { console.log('TURNSTILE_DEBUG no_token'); return false; }
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body }
  );
  if (!res.ok) { console.log('TURNSTILE_DEBUG http_fail', res.status); return false; }
  const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (json.success !== true) console.log('TURNSTILE_DEBUG verify_fail', JSON.stringify(json));
  return json.success === true;
}

import type { AppContext } from '../types';
import { generateToken } from '../auth';
import { tokenHash } from '../lib/invites';
import { parseCookies, verifyCsrf } from '../middleware';

export async function installerSetup(ctx: AppContext): Promise<boolean> {
  return !!await ctx.env.DB.prepare("SELECT key FROM settings WHERE key IN ('setup_ownership_hash', 'setup_session_hash', 'setup_draft') LIMIT 1").first();
}

export async function setupAuthorization(req: Request, ctx: AppContext): Promise<{ hash: string; expires: number } | null> {
  const token = parseCookies(req.headers.get('cookie')).extb_setup;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await tokenHash(token);
  const row = await ctx.env.DB.prepare(`SELECT CAST(e.value AS INTEGER) AS expires FROM settings h
    JOIN settings e ON e.key = 'setup_session_expires_at'
    WHERE h.key = 'setup_session_hash' AND h.value = ? AND CAST(e.value AS INTEGER) > ?
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_complete')`).bind(hash, Date.now()).first<{ expires: number }>();
  return row ? { hash, expires: row.expires } : null;
}

export async function claimOwnership(req: Request, ctx: AppContext): Promise<Response> {
  await verifyCsrf(req, ctx);
  if (Number(req.headers.get('content-length') || 0) > 4096) return new Response('Invalid claim', { status: 413 });
  const text = await req.text();
  if (text.length > 4096) return new Response('Invalid claim', { status: 413 });
  let body: { token?: unknown } | null = null;
  try { body = JSON.parse(text); } catch {}
  if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return new Response('Invalid or expired ownership authorization.', { status: 403 });
  const hash = await tokenHash(body.token);
  const session = generateToken();
  const now = Date.now();
  try {
    // The NOT NULL and unique constraints reject invalid claims and racing exchanges.
    // D1 batch is transactional: credentials are consumed together with session creation.
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('setup_session_hash', CASE WHEN
        EXISTS (SELECT 1 FROM settings WHERE key = 'setup_ownership_hash' AND value = ?)
        AND EXISTS (SELECT 1 FROM settings WHERE key = 'setup_ownership_expires_at' AND CAST(value AS INTEGER) > ?)
        AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'setup_complete')
        AND NOT EXISTS (SELECT 1 FROM users WHERE access_level = 'admin')
        THEN ? ELSE NULL END)`).bind(hash, now, await tokenHash(session)),
      ctx.env.DB.prepare("INSERT INTO settings (key, value) SELECT 'setup_session_expires_at', value FROM settings WHERE key = 'setup_ownership_expires_at'"),
      ctx.env.DB.prepare("DELETE FROM settings WHERE key IN ('setup_ownership_hash', 'setup_ownership_expires_at')"),
    ]);
  } catch {
    return new Response('Invalid or expired ownership authorization.', { status: 403 });
  }
  ctx.cookies.push(`extb_setup=${session}; Path=/setup; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`);
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export const ownershipFragmentScript = `<script>
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('ownership');
  if (!token) return;
  history.replaceState(null, '', location.pathname + location.search);
  const csrf = document.querySelector('input[name="csrf"]')?.value;
  fetch('/setup/claim', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: JSON.stringify({token}) })
    .then(r => { if (r.ok) location.reload(); else document.getElementById('ownership-status').textContent = 'Your ownership link is invalid or expired. Return to the installer.'; })
    .catch(() => { document.getElementById('ownership-status').textContent = 'Connection failed. Return to the installer to reopen setup.'; });
})();
</script>`;

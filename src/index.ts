import { resolveLocale, localizeResponse } from './lib/localization';
import { loadBranding } from './lib/branding';
import { getSetting } from './db/settings';
import { handleMcp } from './mcp/index';
import { isSetupComplete } from './api/setup';
import type { AppContext, Env } from './types';
import { resolveSession, verifyCsrf } from './middleware';
import { dispatch } from './router';
import { routes } from './routes';
import { isCacheableGuestRequest, guestCacheTtl } from './cache';
import { applySecurityHeaders } from './lib/security-headers';
export { ChatRoom } from './durable/chat-room';

// Per-isolate single-flight dedup. When a popular cacheable URL expires from
// the edge cache and N concurrent guests stampede the Worker, they all run
// the same dispatch+D1 fan-out. Coalescing to one in-flight render per URL
// cuts D1 rows-read on stampede events by N-1. Module-scope state is
// per-isolate (not per-PoP), so dedup is best-effort, not exhaustive.
const inflight = new Map<string, Promise<Response>>();

function canonicalHostRedirect(req: Request, env: Env): Response | null {
  if (!env.COMMUNITY_ORIGIN) return null;
  const incoming = new URL(req.url);
  if (incoming.hostname === 'localhost' || incoming.hostname === '127.0.0.1') return null;
  const canonical = new URL(env.COMMUNITY_ORIGIN);
  if (incoming.origin === canonical.origin) return null;
  return Response.redirect(`${canonical.origin}${incoming.pathname}${incoming.search}`, 301);
}

export default {
  async fetch(req: Request, env: Env, exeCtx: ExecutionContext): Promise<Response> {
    if (new URL(req.url).pathname === '/healthz') {
      if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405 });
      try {
        await env.DB.prepare('SELECT 1 AS ready').first();
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      } catch { return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    const hostRedirect = canonicalHostRedirect(req, env);
    if (hostRedirect) return hostRedirect;

    const pathname = new URL(req.url).pathname;
    if (pathname === '/mcp') return handleMcp(req, env, exeCtx);
    const origin = env.COMMUNITY_ORIGIN || new URL(req.url).origin;
    const branding = await loadBranding(env);
    const locale = resolveLocale(req, branding.default_locale);
    const secret = env.CHAT_DO_SECRET || (await getSetting(env, 'chat_auth_secret'))?.value || '';
    const requestEnv: Env = { ...env, COMMUNITY_ORIGIN: origin, CHAT_DO_SECRET: secret };
    const ctx: AppContext = { env: requestEnv, user: null, cookies: [], branding, origin, locale };
    if (pathname !== '/setup' && !pathname.startsWith('/setup/') && !pathname.startsWith('/css/') && !pathname.startsWith('/icons/') && pathname !== '/favicon.svg' && !(await isSetupComplete(ctx))) {
      return Response.redirect(`${origin}/setup`, 302);
    }
    const chosenLanguage = new URL(req.url).searchParams.get('lang');
    if (chosenLanguage === 'he' || chosenLanguage === 'en') ctx.cookies.push(`extb_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`);
    const user = await resolveSession(req, env, ctx);
    ctx.user = user;

    // Serve static assets (css, icons, etc.) before hitting the Worker router
    if (req.method === 'GET' && env.ASSETS) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/docs/')) {
        try { return await env.ASSETS.fetch(req); } catch (_) {}
      }
    }

    // Edge cache for logged-out visitors. resolveSession already ran above, so
    // even on a cache hit a guest still receives a fresh csrf cookie via
    // ctx.cookies (merged by withCookies). The cached bytes are body only.
    const cache = caches.default;
    const cacheable = isCacheableGuestRequest(req) && req.headers.get('Upgrade') !== 'websocket';
    // BUILD_ID in the cache key invalidates stale HTML after each deploy.
    // Without this, cache.default's URL-only keying serves pre-deploy HTML
    // for the full TTL window (acute once REC-4 raises cold TTLs to 1h).
    const cacheUrl = new URL(req.url);
    cacheUrl.searchParams.set('__extb_locale', locale);
    cacheUrl.searchParams.set('__extb_build', env.BUILD_ID || 'dev');
    // Branding content is part of the key: panel and MCP edits take effect immediately.
    const brandingDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(branding)));
    cacheUrl.searchParams.set('__extb_brand', [...new Uint8Array(brandingDigest)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
    const cacheKey = cacheable ? new Request(cacheUrl, req) : req;
    if (cacheable) {
      const hit = await cache.match(cacheKey);
      if (hit) return withCookies(hit, ctx);
      // Cache miss on a cacheable URL: dedup concurrent stampede requests.
      // Each waiter clones the shared Response since Response bodies are
      // single-use. Cookies and HTMX handling stay per-request (they depend
      // on the caller's session/headers, not the shared render).
      const flightKey = cacheKey.url;
      let pending = inflight.get(flightKey);
      if (!pending) {
        pending = (async () => {
          try {
            return await renderAndMaybeCache(req, ctx, cache, cacheKey, exeCtx);
          } finally {
            inflight.delete(flightKey);
          }
        })();
        inflight.set(flightKey, pending);
      }
      const shared = await pending;
      return withCookies(shared.clone(), ctx);
    }

    let response: Response;
    try {
      await verifyCsrf(req, ctx);
      response = await dispatch(req, ctx, routes);
    } catch (thrown) {
      if (thrown instanceof Response) {
        response = thrown;
      } else {
        console.error('unhandled', thrown);
        response = new Response('Internal Server Error', { status: 500 });
      }
    }

    // HTMX requests: convert any 3xx redirect to HX-Redirect so HTMX does a
    // full-page navigation instead of swapping the redirect target into hx-target
    // (which produces a nested layout). Applies to both returned and thrown redirects.
    if (
      req.headers.get('hx-request') === 'true' &&
      response.status >= 300 && response.status < 400
    ) {
      const loc = response.headers.get('Location');
      if (loc) {
        response = new Response(null, { status: 200, headers: { 'HX-Redirect': loc } });
      }
    }

    return withCookies(await localizeResponse(response, locale, req.url), ctx);
  }
};

/**
 * Cacheable-guest render path: dispatch the route, attach edge-cache headers,
 * `waitUntil` the cache.put, and return the response. Pulled into a helper so
 * single-flight dedup can wrap exactly one invocation per (URL, BUILD_ID).
 *
 * NOTE: ctx.cookies are deliberately NOT merged here - the shared Response is
 * cloned per waiter and `withCookies` runs against each waiter's own ctx.
 */
async function renderAndMaybeCache(
  req: Request,
  ctx: AppContext,
  cache: Cache,
  cacheKey: Request,
  exeCtx: ExecutionContext,
): Promise<Response> {
  let response: Response;
  try {
    await verifyCsrf(req, ctx);
    response = await dispatch(req, ctx, routes);
  } catch (thrown) {
    if (thrown instanceof Response) {
      response = thrown;
    } else {
      console.error('unhandled', thrown);
      response = new Response('Internal Server Error', { status: 500 });
    }
  }

  // HTMX 3xx -> HX-Redirect (see fetch handler for rationale).
  if (
    req.headers.get('hx-request') === 'true' &&
    response.status >= 300 && response.status < 400
  ) {
    const loc = response.headers.get('Location');
    if (loc) {
      response = new Response(null, { status: 200, headers: { 'HX-Redirect': loc } });
    }
  }

  response = await localizeResponse(response, ctx.locale ?? 'en', req.url);

  // Store cacheable guest responses. Built from the dispatch result BEFORE
  // ctx.cookies is merged, so the stored Response carries no Set-Cookie
  // (the Cache API rejects responses with Set-Cookie).
  // s-maxage drives the shared edge cache (caches.default); private/no-store
  // on Cache-Control keeps the browser from privately caching a guest page,
  // so a guest who logs in within the window is not served stale guest HTML.
  if (response.status === 200) {
    const toStore = new Response(response.body, response);
    toStore.headers.set('Cdn-Cache-Control', `public, s-maxage=${guestCacheTtl(req)}`);
    toStore.headers.set('Cache-Control', 'private, no-store, must-revalidate');
    toStore.headers.set('Vary', 'HX-Request, Cookie');
    exeCtx.waitUntil(cache.put(cacheKey, toStore.clone()));
    response = toStore;
  }
  return response;
}

/** Append any cookies accumulated on ctx (e.g. a fresh csrf token) to the
 *  response, then apply baseline security headers (CSP-RO, nosniff, frame
 *  deny, HSTS, etc. - see src/lib/security-headers.ts). */
function withCookies(response: Response, ctx: AppContext): Response {
  // A 101 Switching Protocols (WebSocket upgrade) response is not constructable
  // via `new Response(...)` and carries no cookies - pass it through untouched.
  if (response.status === 101 || (response as any).webSocket) return response;
  let out = response;
  if (ctx.cookies.length > 0) {
    out = new Response(response.body, response);
    for (const cookieStr of ctx.cookies) {
      out.headers.append('Set-Cookie', cookieStr);
    }
  }
  return applySecurityHeaders(out);
}

export { PasswordHasher } from './password-hasher';

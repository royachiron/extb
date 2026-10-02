import { parseCookies } from './middleware';

/**
 * Two-tier guest-cache TTL in seconds.
 *
 * HOT (60s) for paths that may change minute-to-minute - forum index, room
 * pages, topic pages. Stale up to one minute for logged-out visitors.
 *
 * COLD (3600s) for paths that almost never change - about/faq/tos pages,
 * public profile pages. Edits that need to invalidate the COLD cache must
 * call `cache.delete(cacheKey)` explicitly on the affected URL (see
 * postProfileUpdate in src/api/users.ts).
 */
export const GUEST_CACHE_TTL_HOT = 60;
export const GUEST_CACHE_TTL_COLD = 3600;

/**
 * Paths whose logged-out GET response is safe to serve from shared edge cache.
 * Routes that can render CSRF-bearing forms are deliberately excluded because
 * cached HTML would otherwise contain a stale token that no longer matches the
 * fresh csrf cookie set by resolveSession on each request.
 */
const GUEST_CACHEABLE_PATHS: Array<{ re: RegExp; ttl: number }> = [
  { re: /^\/forum\/?$/, ttl: GUEST_CACHE_TTL_HOT },
  { re: /^\/u\/[^/]+\/?$/, ttl: GUEST_CACHE_TTL_COLD },
];

/**
 * TTL in seconds for a cacheable guest request. Returns 0 if not cacheable;
 * callers should call `isCacheableGuestRequest(req)` first when they need the
 * boolean decision separately. For cache-write paths use this directly.
 */
export function guestCacheTtl(req: Request): number {
  const path = new URL(req.url).pathname;
  const entry = GUEST_CACHEABLE_PATHS.find((e) => e.re.test(path));
  return entry ? entry.ttl : 0;
}

/**
 * True when a request may be served from / stored in the shared edge cache.
 * Pure - depends only on the request. Excludes: non-GET methods, HTMX partial
 * requests (different body than a full page at the same URL), any request
 * carrying a `session` cookie, and any path not on the allowlist.
 *
 * Cache-key contract for callers: an allowlisted path may still render
 * differently per query string (e.g. `/?room=X` is a different room view).
 * Callers MUST key the cache by the full request URL - pass the raw `Request`
 * to `caches.default.match/put`, never a pathname-normalized key - so two
 * query strings never collide on one cache entry.
 */
export function isCacheableGuestRequest(req: Request): boolean {
  if (req.method !== 'GET') return false;
  if (req.headers.get('hx-request') === 'true') return false;
  const cookies = parseCookies(req.headers.get('Cookie'));
  if (cookies['session']) return false;
  const path = new URL(req.url).pathname;
  return GUEST_CACHEABLE_PATHS.some((e) => e.re.test(path));
}

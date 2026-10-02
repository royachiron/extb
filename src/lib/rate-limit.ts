// Per-isolate sliding-window rate limiter.
//
// Cloudflare spawns N isolates per PoP. State here is per-isolate, so the
// effective ceiling is N x the per-isolate cap. For login/register/reset
// abuse, this is "slow down dumb bots" defense; Turnstile is the real wall
// for sophisticated attackers. The two layered together give us:
//   - Bots that ignore CAPTCHA: throttled per-isolate, blocked by Turnstile
//   - Bots that solve CAPTCHA: throttled per-isolate, cost rises sharply
//   - Real users: limits are well above normal flow
//
// Module-scope state survives across requests within the same isolate. No DB
// writes, no KV calls -- pure in-memory, microsecond cost per check.

interface Bucket {
  /** Sorted timestamps (ms) of recent admitted requests within the window. */
  times: number[];
  /** Used by LRU eviction when MAX_KEYS exceeded. */
  lastTouchedMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // cap memory; LRU-evict oldest when exceeded

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds until the next admission slot frees up. 0 when ok. */
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { times: [], lastTouchedMs: now };
    buckets.set(key, bucket);
  }
  bucket.lastTouchedMs = now;
  // Drop expired timestamps from the front of the window.
  while (bucket.times.length > 0 && bucket.times[0]! < cutoff) {
    bucket.times.shift();
  }
  if (bucket.times.length >= max) {
    const retryAfterMs = bucket.times[0]! + windowMs - now;
    return { ok: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }
  bucket.times.push(now);
  evictIfFull();
  return { ok: true, retryAfterMs: 0 };
}

function evictIfFull(): void {
  if (buckets.size <= MAX_KEYS) return;
  // O(n) sweep -- only fires when the map is full, which is rare. Drop the
  // 10% least-recently-touched keys.
  const entries = Array.from(buckets.entries());
  entries.sort((a, b) => a[1].lastTouchedMs - b[1].lastTouchedMs);
  const drop = Math.ceil(buckets.size * 0.1);
  for (let i = 0; i < drop; i++) buckets.delete(entries[i]![0]);
}

/** Extract a best-effort client IP from the request. CF-Connecting-IP is
 *  the Cloudflare-injected source-of-truth on Workers. Falls through to
 *  alternative headers so the limiter still functions in tests / dev. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/** Test helper -- clear all buckets. Not exported in production runtime. */
export function _resetForTests(): void {
  buckets.clear();
}

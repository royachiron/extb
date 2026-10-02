import type { AppContext } from '../types';
import { renderLayout, esc } from '../views/layout';
import { renderSearchResults } from '../views/search';
import { listRooms, searchContent } from '../db';
import { onboardingRedirect } from '../middleware';
import { checkRateLimit, getClientIp } from '../lib/rate-limit';

const SEARCH_RATE_MAX = 30;
const SEARCH_RATE_WINDOW_MS = 60_000;

export async function getSearch(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const onboardingGate = onboardingRedirect(ctx);
  if (onboardingGate) return onboardingGate;

  const searchLimitKey = ctx.user ? `search:user:${ctx.user.id}` : `search:ip:${getClientIp(req)}`;
  const searchLimit = checkRateLimit(searchLimitKey, SEARCH_RATE_MAX, SEARCH_RATE_WINDOW_MS);
  if (!searchLimit.ok) {
    return new Response('<h1>429 - Too many searches. Please slow down.</h1>', {
      status: 429,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const PAGE = 50;
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  let results: any[] = [];
  let hasMore = false;

  if (q.trim()) {
    // Sanitize query for FTS5 (escape double quotes, wrap in quotes for robust matching)
    const ftsQuery = '"' + q.replace(/"/g, '""') + '*"';
    try {
      results = await searchContent(ctx.env, ctx.user, ftsQuery, PAGE + 1, offset);
      hasMore = results.length > PAGE;
      if (hasMore) results = results.slice(0, PAGE);
    } catch (e) {
      console.error('Search error:', e);
      results = [];
    }
  }

  const allRooms = await listRooms(ctx.env);
  const rooms = allRooms.filter(r => !r.is_page);

  const body = renderSearchResults({ q, results, hasMore, offset, pageSize: PAGE });

  return new Response(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: `Search: ${esc(q)}`, body, showFab: false, noindex: true }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

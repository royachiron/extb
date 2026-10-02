import type { AppContext } from '../types';
import { fetchOGData, renderOGCard } from '../lib/unfurls';
import { checkRateLimit, getClientIp } from '../lib/rate-limit';

const UNFURL_RATE_MAX = 20;
const UNFURL_RATE_WINDOW_MS = 60_000;

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getUnfurl(
  req: Request,
  _ctx: AppContext
): Promise<Response> {
  const ip = getClientIp(req);
  const limit = checkRateLimit(`unfurl:${ip}`, UNFURL_RATE_MAX, UNFURL_RATE_WINDOW_MS);
  if (!limit.ok) return json({ error: 'rate limited' }, 429);

  const url = new URL(req.url).searchParams.get('url');
  if (!url) return json({ error: 'missing url param' }, 400);

  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return json({ error: 'invalid url' }, 400);
    }
  } catch {
    return json({ error: 'invalid url' }, 400);
  }

  const og = await fetchOGData(url);
  if (!og) return json({ error: 'failed to fetch' }, 404);

  const card = renderOGCard(og, url);
  return json({ og, card });
}

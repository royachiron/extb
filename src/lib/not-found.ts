import type { AppContext } from '../types';
import { renderLayout } from '../views/layout';
import { listRooms } from '../db';

/**
 * Handlers return a bare "<h1>404</h1>" (or the router's plain "Not Found") from many places.
 * For a normal browser page load, swap that for a 404 page inside the forum layout; API,
 * HTMX and asset requests keep their small bodies.
 */
export async function friendlyNotFound(req: Request, ctx: AppContext, response: Response): Promise<Response> {
  if (response.status !== 404 || req.method !== 'GET' || req.headers.get('hx-request') === 'true') return response;
  if (!(req.headers.get('accept') || '').includes('text/html')) return response;
  const path = new URL(req.url).pathname;
  if (/^\/(api|css|icons|media|mcp)\//.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return response;
  const body = await response.clone().text();
  if (body.length > 64) return response;
  const page = `<div class="not-found" style="max-width:520px;margin:48px auto;text-align:center;">
    <h1 style="font-size:28px;margin:0 0 12px;"><!--extb-ui-->Page not found<!--/extb-ui--></h1>
    <p style="color:var(--text-muted);margin:0 0 24px;"><!--extb-ui-->This page does not exist or was removed.<!--/extb-ui--></p>
    <a class="btn" href="/"><!--extb-ui-->Back to the forum<!--/extb-ui--></a></div>`;
  const html = renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms: await listRooms(ctx.env), csrfToken: ctx.csrfToken, title: 'Page not found', body: page, noindex: true });
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

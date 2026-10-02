import { DEFAULT_BRANDING } from '../lib/branding';
import type { AppContext } from '../types';
import { listRooms, listFeedTopics } from '../db';
import { renderLayout, csrfField, esc } from '../views/layout';
import { renderTosPage, CURRENT_TOS_VERSION, TOS_LAST_UPDATED } from '../views/tos';

import { html } from '../lib/http';
import { STATIC_PAGES } from '../views/static-pages';
import { SW_SCRIPT } from '../views/sw-template';

function xml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

function txt(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}


export async function getManifest(
  _req: Request,
  ctx: AppContext,
): Promise<Response> {
  const content = {
    name: (ctx.branding || DEFAULT_BRANDING).name,
    short_name: (ctx.branding || DEFAULT_BRANDING).name,
    description: (ctx.branding || DEFAULT_BRANDING).description,
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: (ctx.branding || DEFAULT_BRANDING).accent_color,
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
  return new Response(JSON.stringify(content), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}

export async function getServiceWorker(
  _req: Request,
  ctx: AppContext,
): Promise<Response> {
  const content = SW_SCRIPT;
  return new Response(content, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function getFavicon(
  _req: Request,
  ctx: AppContext,
): Promise<Response> {
  const accent = (ctx.branding || DEFAULT_BRANDING).accent_color;
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${esc(accent)}"/><text x="50" y="63" font-family="sans-serif" font-weight="900" font-size="30" fill="white" text-anchor="middle">EXTB</text></svg>`;
  return new Response(content, {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

export async function getStaticPage(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const page = STATIC_PAGES[path];

  if (!page) {
    return html('<h1>404 Not Found</h1>', 404);
  }

  // Show a banner when an anon/unverified user has been bounced here from a
  // gated room. Anons see a register prompt; logged-in unverified users see
  // a resend-verification prompt.
  const showGatedPrompt = url.searchParams.get('verify') === '1' || url.searchParams.get('from') === 'gated';
  let verifyPrompt = '';
  if (showGatedPrompt) {
    if (ctx.user && !ctx.user.is_approved) {
      verifyPrompt = `<div class="flash flash-warn" style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
         <span>Please confirm your email address to access the forum.</span>
         <form method="POST" action="/resend-verification" style="margin:0;">
           ${csrfField({ csrfToken: ctx.csrfToken })}
           <button type="submit" class="btn" style="padding:4px 12px;font-size:13px;">Resend verification email</button>
         </form>
       </div>`;
    } else if (!ctx.user) {
      verifyPrompt = `<div class="flash flash-warn" style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
         <span>Register and confirm your email to access the rest of the forum.</span>
         <span style="display:flex;gap:8px;">
           <a href="/register" class="btn" style="padding:4px 12px;font-size:13px;">Register</a>
           <a href="/login" class="btn" style="padding:4px 12px;font-size:13px;background:transparent;color:var(--primary);border:1px solid var(--primary);">Log in</a>
         </span>
       </div>`;
    }
  }
  const content = verifyPrompt + page.content;

  if (req.headers.get('hx-request') === 'true') {
    return html(content);
  }

  const allRooms = await listRooms(ctx.env);

  const body = renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
    user: ctx.user,
    rooms: allRooms,
    title: page.title,
    body: content,
    canonicalUrl: page.canonicalUrl,
    description: page.desc,
    csrfToken: ctx.csrfToken,
    ogType: page.ogType,
    jsonLd: page.jsonLd,
    ogImage: page.ogImage,
    articlePublishedTime: page.articlePublishedTime,
    articleAuthor: page.articleAuthor,
  });

  return html(body);
}

export async function getTos(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const content = renderTosPage(ctx.branding);
  if (req.headers.get('hx-request') === 'true') {
    return html(content);
  }
  const allRooms = await listRooms(ctx.env);
  const body = renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
    user: ctx.user,
    rooms: allRooms,
    title: `Community Guidelines & Terms of Use (v${CURRENT_TOS_VERSION})`,
    body: content,
    canonicalUrl: '/about/tos',
    description: `Community guidelines and terms of use. Last updated ${TOS_LAST_UPDATED}.`,
    csrfToken: ctx.csrfToken,
  });
  return html(body);
}

export async function getRobotsTxt(
  _req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const content = `User-agent: *
Allow: /
Allow: /r/
Allow: /t/
Allow: /about/
Allow: /expressions/
Allow: /resources/
Allow: /community/
Allow: /questions/
Allow: /search
Disallow: /login
Disallow: /register
Disallow: /verify
Disallow: /u/
Disallow: /users
Disallow: /dms/
Disallow: /admin/
Disallow: /mod/
Disallow: /settings/
Disallow: /chat/
Disallow: /new
Disallow: /appeal
Disallow: /upgrade
Disallow: /api/

Sitemap: ${ctx.origin || new URL(_req.url).origin}/sitemap.xml
`;
  return txt(content);
}

export async function getSitemapXml(
  _req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const staticUrls = Object.values(STATIC_PAGES).map(p => `
  <url>
    <loc>${ctx.origin || new URL(_req.url).origin}${p.canonicalUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  const allRooms = await listRooms(ctx.env).catch(() => []);
  const publicRooms = allRooms.filter((r: any) => !r.is_page && r.min_read === 'anon' && !r.is_exclusive && !r.is_locked);
  const roomUrls = publicRooms.map((r: any) => `
  <url>
    <loc>${ctx.origin || new URL(_req.url).origin}/r/${r.slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('');

  // Topics in public rooms only
  const publicRoomIds = new Set(publicRooms.map((r: any) => r.id));
  const recentTopics = await listFeedTopics(ctx.env, null, 500, 0).catch(() => []);
  const publicTopics = recentTopics.filter((t: any) => publicRoomIds.has(t.room_id));
  const topicUrls = publicTopics.map((t: any) => `
  <url>
    <loc>${ctx.origin || new URL(_req.url).origin}/t/${t.short_id}</loc>
    <lastmod>${(t.last_reply_at || t.created_at || '').replace(' ', 'T').replace(/(\d{2}:\d{2}:\d{2})$/, '$1Z')}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${esc(ctx.origin || new URL(_req.url).origin)}/</loc></url>${roomUrls}${staticUrls}${topicUrls}
</urlset>`;
  return xml(content);
}

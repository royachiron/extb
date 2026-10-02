import type { AppContext } from '../types';
import { requireAdmin } from '../middleware';
import { listRooms } from '../db';
import { renderLayout, csrfField, esc } from '../views/layout';
import { postCreateInvite, postCreateResetLink } from './setup';

async function page(ctx: AppContext, link = '', reset = false): Promise<Response> {
  requireAdmin(ctx);
  const body = `<h1>Invite your community</h1><p>Create a private, single-use invitation. It expires in seven days. Share it with the person you want to invite.</p>
  ${link ? `<div class="card"><label>${reset ? 'Password reset link, valid for one hour' : 'Invitation link'}<input readonly value="${esc(link)}" onclick="this.select()"></label><p>Copy this link now. Keep it private.</p></div>` : ''}
  <form method="post" action="/admin/invites">${csrfField(ctx)}<button class="btn">Create invitation</button></form>
  <h2>Help a member recover access</h2><p>Open the member editor to find their numeric user ID. A reset link expires in one hour.</p>
  <form method="post" action="/admin/reset-link">${csrfField(ctx)}<label>User ID<input type="number" name="user_id" min="1" required></label><button class="btn">Create reset link</button></form>`;
  return new Response(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms: await listRooms(ctx.env), title: 'Invitations', body, csrfToken: ctx.csrfToken, showFab: false }), {headers: {'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export async function getInvitations(_req: Request, ctx: AppContext): Promise<Response> { return page(ctx); }
export async function createInvitationPage(req: Request, ctx: AppContext): Promise<Response> {
 const result = await postCreateInvite(req, ctx); if (!result.ok) return result;
 const data = await result.json() as {url:string}; return page(ctx, data.url);
}
export async function createResetPage(req: Request, ctx: AppContext, params: Record<string,string>): Promise<Response> {
 let id = params.id;
 if (!id) { const form = await req.clone().formData(); id = String(form.get('user_id') || ''); }
 const result = await postCreateResetLink(req,ctx,{id}); if (!result.ok) return result;
 const data = await result.json() as {url:string}; return page(ctx,data.url,true);
}

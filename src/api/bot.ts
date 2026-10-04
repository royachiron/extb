import type { AppContext } from '../types';
import { getSetting, getAllSettings, listRooms } from '../db';
import { renderLayout } from '../views/layout';
import { renderBotPanel, renderBotPage } from '../views/bot';
import { botCommandBranch, helperConfigFromSettings } from '../lib/bot-copy';
import { checkRateLimit } from '../lib/rate-limit';
import { canRead, canPost } from '../access';
import { loadMembershipConfig } from '../lib/membership-config';
import { html, redirect } from '../lib/http';

/** Missing setting = enabled; only an explicit '0' turns the bot off. */
export async function botEnabled(ctx: AppContext): Promise<boolean> {
  const s = await getSetting(ctx.env, 'bot_enabled');
  return s?.value !== '0';
}

export async function botName(ctx: AppContext): Promise<string> {
  return helperConfigFromSettings(await getAllSettings(ctx.env), ctx.locale).name;
}

/**
 * GET /bot - standalone helper page. Open to any verified logged-in user,
 * for approved members.
 */
export async function getBotPage(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  if (!ctx.user) return redirect('/login');
  if (!ctx.user.is_approved) return redirect('/login');
  if (!(await botEnabled(ctx))) return redirect('/');

  const url = new URL(req.url);
  const branchId = (url.searchParams.get('branch') || 'menu').trim();
  const options = await helperOptions(ctx);

  const body = renderBotPage({ ...options, branchId });
  if (req.headers.get('hx-request') === 'true') return html(body);
  const rooms = await listRooms(ctx.env, ctx.user.id);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Getting started', body, csrfToken: ctx.csrfToken }));
}

/**
 * GET /bot/panel - one dialogue node as an HTML fragment. Used by the chat
 * `/bot` command (ephemeral, client-inserted) and by [data-bot-branch]
 * buttons on every surface. Never persisted anywhere.
 */
export async function getBotPanel(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  if (!ctx.user || !ctx.user.is_approved) return html('', 403);
  if (!(await botEnabled(ctx))) return html('', 404);

  // Per-user cooldown: generous for humans, a wall for a stuck client loop.
  const rl = checkRateLimit('bot:' + ctx.user.id, 60, 60 * 60 * 1000);
  if (!rl.ok) return html('<div class="bot-panel"><p class="bot-p">The helper needs a short break. Try again in a few minutes.</p></div>', 429);

  const url = new URL(req.url);
  const cmd = url.searchParams.get('cmd');
  const branchId = cmd != null
    ? botCommandBranch(cmd)
    : (url.searchParams.get('branch') || 'menu').trim();
  const variant = url.searchParams.get('v') === 'page' ? 'page' : 'chat';
  const options = await helperOptions(ctx);

  return html(renderBotPanel(branchId, { ...options, variant }));
}

async function helperOptions(ctx: AppContext) {
  const guidance = helperConfigFromSettings(await getAllSettings(ctx.env), ctx.locale);
  const rooms = (await listRooms(ctx.env, ctx.user?.id)).filter(room => room.kind === 'forum' && !room.is_page && canRead(ctx.user, room));
  const membership = await loadMembershipConfig(ctx.env);
  return { botName: guidance.name, guidance, locale: ctx.locale, rooms,
    applicationRoomSlug: rooms.find(room => room.id === membership.applicationRoomId && canPost(ctx.user, room))?.slug };
}

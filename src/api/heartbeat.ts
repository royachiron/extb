import type { AppContext } from '../types';
import { countUnreadDms, countUnseenNotifications, upsertPresence, countOpenReports, countChatMessagesSince } from '../db';
import { renderDmBadge } from '../views/dms';
import { renderNotificationBadge } from '../views/notifications';
import { renderChatBadge, renderModBadge, renderHeartbeat } from '../views/heartbeat';

// Re-exported for tests + any external importers; the fragments now live in views.
export { renderChatBadge, renderModBadge, renderHeartbeat };

const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

/**
 * GET /api/heartbeat - the single visibility-gated poll that replaces the three
 * per-badge timers (DM 30s, notifications 60s, chat 60s). It records presence
 * for logged-in users and returns every nav badge as an out-of-band swap. The
 * client fires it only while the tab is visible (see the heartbeat timer in
 * layout.ts), so hidden and forgotten-open tabs stop polling entirely.
 *
 * The chat badge is cookie-driven and works for guests too, so guests still get
 * a heartbeat (chat badge only) - that also stops their idle polling.
 */
export async function getHeartbeat(req: Request, ctx: AppContext): Promise<Response> {
  // Chat activity: compare the newest chat message to the chat_last_view cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const lastViewMatch = cookie.match(/(?:^|;\s*)chat_last_view=([^;]+)/);
  const chatQuery: Promise<{ count: number } | null> =
    lastViewMatch && lastViewMatch[1]
      ? countChatMessagesSince(ctx.env, lastViewMatch[1].replace('T', ' ').replace('Z', ''))
      : Promise.resolve(null);

  let dmBadge = '';
  let notifBadge = '';
  let modBadge: string | null = null;
  let chatRow: { count: number } | null;

  if (ctx.user) {
    const isStaff = ['mod', 'admin'].includes(ctx.user.access_level);
    const presence = ctx.user.display_name
      ? upsertPresence(ctx.env, ctx.user.display_name, Date.now())
      : Promise.resolve();
    const [, dmCount, notifCount, cr, openReports] = await Promise.all([
      presence,
      countUnreadDms(ctx.env, ctx.user.id),
      countUnseenNotifications(ctx.env, ctx.user.id),
      chatQuery,
      isStaff ? countOpenReports(ctx.env) : Promise.resolve(null),
    ]);
    dmBadge = renderDmBadge(dmCount);
    notifBadge = renderNotificationBadge(notifCount);
    if (openReports !== null) modBadge = renderModBadge(openReports);
    chatRow = cr;
  } else {
    chatRow = await chatQuery;
  }

  const chatActive = (chatRow?.count ?? 0) > 0;
  return new Response(
    renderHeartbeat(dmBadge, renderChatBadge(chatActive), notifBadge, modBadge),
    { headers: HTML },
  );
}

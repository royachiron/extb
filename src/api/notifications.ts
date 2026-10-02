import type { AppContext, Env } from '../types';
import {
  listNotificationsForUser, listNotificationsPage, markNotificationsRead, listRooms,
  insertNotification, insertNotificationsBatch, getUserDisplayName, getTopicTitleByShortId,
} from '../db';
import { renderNotificationInbox, renderNotificationsPage, renderNotificationItem, renderNotificationsMore } from '../views/notifications';
import { renderLayout } from '../views/layout';

export async function createNotification(
  env: Env,
  userId: number,
  actorId: number | null,
  shortId: string,
  postId: number,
  type: 'mention' | 'reply'
): Promise<void> {
  // Look up actor name for the content string
  const actorName = (actorId ? await getUserDisplayName(env, actorId) : null) || 'Someone';
  const verb = type === 'mention' ? 'mentioned you in' : 'replied to';
  const topicTitle = (await getTopicTitleByShortId(env, shortId)) || 'a thread';
  const content = `${actorName} ${verb} "${topicTitle}"`;
  const url = `/t/${shortId}#post-${postId}`;
  await insertNotification(env, userId, content, url, type);
}

export type NotifyRecipient = { userId: number; type: 'mention' | 'reply' };

/**
 * Computes the deduplicated, ordered recipient list for a new post.
 * Pure. Mentions are emitted before replies; a user who qualifies twice
 * keeps the first reason (mention wins over reply). The post author is
 * never a recipient.
 */
export function collectRecipients(
  mentionUserIds: number[],
  followerUserIds: number[],
  topicAuthorId: number | null,
  postAuthorId: number,
): NotifyRecipient[] {
  const seen = new Set<number>([postAuthorId]);
  const out: NotifyRecipient[] = [];
  for (const id of mentionUserIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ userId: id, type: 'mention' });
  }
  for (const id of followerUserIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ userId: id, type: 'reply' });
  }
  if (topicAuthorId !== null && !seen.has(topicAuthorId)) {
    seen.add(topicAuthorId);
    out.push({ userId: topicAuthorId, type: 'reply' });
  }
  return out;
}

/**
 * Builds the notification content string. Pure - same wording as the
 * per-row createNotification, extracted so it can be unit-tested.
 */
export function buildNotificationContent(
  actorName: string,
  type: 'mention' | 'reply',
  topicTitle: string,
): string {
  const verb = type === 'mention' ? 'mentioned you in' : 'replied to';
  return `${actorName} ${verb} "${topicTitle}"`;
}

/**
 * Inserts notifications for many recipients in a single D1 batch.
 * Replaces calling createNotification in a loop: the actor name and topic
 * title are identical for every recipient of one post, so they are resolved
 * once here instead of once per recipient.
 */
export async function createNotificationsBatch(
  env: Env,
  recipients: NotifyRecipient[],
  actorId: number | null,
  shortId: string,
  postId: number,
): Promise<void> {
  if (recipients.length === 0) return;

  const actorName = (actorId ? await getUserDisplayName(env, actorId) : null) || 'Someone';
  const topicTitle = (await getTopicTitleByShortId(env, shortId)) || 'a thread';
  const url = `/t/${shortId}#post-${postId}`;

  await insertNotificationsBatch(
    env,
    recipients.map((r) => ({
      userId: r.userId,
      content: buildNotificationContent(actorName, r.type, topicTitle),
      url,
      type: r.type,
    }))
  );
}

export async function getNotifications(
  _req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 });

  const notifications = await listNotificationsForUser(ctx.env, ctx.user.id, 20);
  await markNotificationsRead(ctx.env, ctx.user.id);

  const html = renderNotificationInbox(notifications);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const HTML = { 'Content-Type': 'text/html; charset=utf-8' };
const NOTIF_PAGE_SIZE = 30;

/** GET /notifications - full history page. Does NOT auto-mark-read. */
export async function getNotificationsPage(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return new Response(null, { status: 303, headers: { Location: '/login' } });

  const { notifications, nextBeforeId } = await listNotificationsPage(ctx.env, ctx.user.id, NOTIF_PAGE_SIZE, null);
  const body = renderNotificationsPage({ notifications, nextBeforeId, csrfToken: ctx.csrfToken });

  if (req.headers.get('hx-request') === 'true') return new Response(body, { headers: HTML });
  const rooms = await listRooms(ctx.env, ctx.user.id);
  return new Response(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Notifications', body, csrfToken: ctx.csrfToken }),
    { headers: HTML },
  );
}

/** GET /notifications/page?before= - next page partial (OOB append). */
export async function getNotificationsPagePartial(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 });
  const beforeId = parseInt(new URL(req.url).searchParams.get('before') ?? '', 10);
  if (!Number.isFinite(beforeId) || beforeId <= 0) return new Response('bad cursor', { status: 400 });

  const { notifications, nextBeforeId } = await listNotificationsPage(ctx.env, ctx.user.id, NOTIF_PAGE_SIZE, beforeId);
  const items = notifications.map(renderNotificationItem).join('');
  return new Response(
    `${renderNotificationsMore(nextBeforeId)}<div hx-swap-oob="beforeend:#notif-list">${items}</div>`,
    { headers: HTML },
  );
}

/** POST /api/notifications/read-all - mark everything read, re-render page + zero the badge. */
export async function postReadAllNotifications(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 });
  await markNotificationsRead(ctx.env, ctx.user.id);

  const { notifications, nextBeforeId } = await listNotificationsPage(ctx.env, ctx.user.id, NOTIF_PAGE_SIZE, null);
  const body = renderNotificationsPage({ notifications, nextBeforeId, csrfToken: ctx.csrfToken });
  const badgeReset = `<span hx-swap-oob="innerHTML:#notification-badge-container"></span>`;

  if (req.headers.get('hx-request') === 'true') return new Response(body + badgeReset, { headers: HTML });
  return new Response(null, { status: 303, headers: { Location: '/notifications' } });
}

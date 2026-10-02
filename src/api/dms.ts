import type { AppContext, User } from '../types';
import type { ConversationSummary } from '../db/dms';
import {
  listConversations,
  listUnreadCountsFor,
  listDmsWith,
  listDmsSince,
  isBlocked,
  createDm,
  markDmsRead,
  getUserById,
  getUsersByIds,
  getUserByDisplayName,
  listRooms,
  isUserActive,
  getActivePresence,
} from '../db';
import { requireMember } from '../middleware';
import { renderConversations, renderConversationsPage, renderThread, renderDmContent, renderDmBadge, renderDmPollItems, renderDmOlderPage, type ConversationRow } from '../views/dms';

// Re-exported for tests + any external importers; the fragment now lives in views.
export { renderDmBadge };
import { renderLayout } from '../views/layout';
import { pushToUser } from '../lib/notify';
import { checkRateLimit } from '../lib/rate-limit';

const DM_RATE_MAX = 20;
const DM_RATE_WINDOW_MS = 60_000;

// Page sizes match the site's other cursor surfaces (NOTIF_PAGE_SIZE 30,
// TOPIC_PAGE_SIZE 50).
const DM_INBOX_PAGE_SIZE = 30;
const DM_THREAD_PAGE_SIZE = 50;

export function canRestrictedMemberDm(recipient: User): boolean {
  return recipient.access_level === 'admin';
}

import { html, redirect } from '../lib/http';

export async function getThreadMessages(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const otherName = params.name ?? '';
  let other = await getUserByDisplayName(ctx.env, otherName);
  if (!other && otherName.startsWith('user')) {
    const fallbackId = parseInt(otherName.slice(4), 10);
    if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
  }
  if (!other) return new Response('', { status: 404 });

  const url = new URL(req.url);
  const sinceId = Number(url.searchParams.get('since') || '0');

  const dms = await listDmsSince(ctx.env, user.id, other.id, sinceId);
  if (dms.length === 0) return new Response('', { status: 200 });

  // Mark as read
  await markDmsRead(ctx.env, user.id, other.id);

  return new Response(renderDmPollItems(dms, user.id), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/**
 * Resolve one page of conversation summaries into renderable rows.
 * Unread counts are fetched for this page only - see listUnreadCountsFor.
 */
async function buildConversationRows(
  ctx: AppContext,
  userId: number,
  summaries: ConversationSummary[],
): Promise<ConversationRow[]> {
  // Resolve every "other" user in one query. Drop rows whose user vanished.
  const [usersById, unreadByOther] = await Promise.all([
    getUsersByIds(ctx.env, summaries.map((s) => s.other_id)),
    listUnreadCountsFor(ctx.env, userId, summaries.map((s) => s.other_id)),
  ]);

  const conversations: ConversationRow[] = [];
  for (const s of summaries) {
    const other = usersById.get(s.other_id);
    if (!other) continue;
    conversations.push({
      other,
      lastContent: s.last_content,
      lastAt: s.last_created_at,
      unread: unreadByOther.get(s.other_id) ?? 0,
    });
  }
  return conversations;
}

/** Resolve a DM route's :name param, with the legacy "user<id>" fallback. */
async function resolveOther(ctx: AppContext, name: string) {
  let other = await getUserByDisplayName(ctx.env, name);
  if (!other && name.startsWith('user')) {
    const fallbackId = parseInt(name.slice(4), 10);
    if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
  }
  return other;
}

/**
 * GET /api/dms/:name/older?before= - older page of a thread (OOB prepend).
 * Unlike the poll endpoint this does NOT mark anything read: reading back
 * through history must not clear unread state for messages still below.
 */
export async function getThreadOlder(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);

  const other = await resolveOther(ctx, params.name ?? '');
  if (!other) return new Response('', { status: 404 });

  const beforeId = parseInt(new URL(req.url).searchParams.get('before') ?? '', 10);
  if (!Number.isFinite(beforeId) || beforeId <= 0) return html('bad cursor', 400);

  const page = await listDmsWith(ctx.env, user.id, other.id, DM_THREAD_PAGE_SIZE, beforeId);
  return html(renderDmOlderPage(other.display_name || '', page.dms, user.id, page.nextBeforeId));
}

export async function getConversations(
  _req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);

  const [rooms, page, activeNames] = await Promise.all([
    listRooms(ctx.env),
    listConversations(ctx.env, user.id, DM_INBOX_PAGE_SIZE, null),
    getActivePresence(ctx.env),
  ]);

  const onlineSet = new Set(activeNames);
  const conversations = await buildConversationRows(ctx, user.id, page.conversations);

  const body = renderConversations({ user, conversations, nextBeforeId: page.nextBeforeId, onlineNames: onlineSet, csrfToken: ctx.csrfToken, vapidPublicKey: ctx.env.VAPID_PUBLIC_KEY });
  if (_req.headers.get('hx-request') === 'true') return html(body);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Inbox', body, csrfToken: ctx.csrfToken, showFab: false }));
}

/** GET /api/dms/page?before= - next page of conversations (OOB append). */
export async function getConversationsPage(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);

  const beforeId = parseInt(new URL(req.url).searchParams.get('before') ?? '', 10);
  if (!Number.isFinite(beforeId) || beforeId <= 0) return html('bad cursor', 400);

  const [page, activeNames] = await Promise.all([
    listConversations(ctx.env, user.id, DM_INBOX_PAGE_SIZE, beforeId),
    getActivePresence(ctx.env),
  ]);

  const conversations = await buildConversationRows(ctx, user.id, page.conversations);
  return html(renderConversationsPage(conversations, new Set(activeNames), page.nextBeforeId));
}

export async function getThread(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const displayName = params.name ?? '';

  let other = await getUserByDisplayName(ctx.env, displayName);
  if (!other && displayName.startsWith('user')) {
    const fallbackId = parseInt(displayName.slice(4), 10);
    if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
  }
  if (!other) return html('User not found', 404);
  if (other.id === user.id) return redirect('/dms');

  const [rooms, page, isOnline] = await Promise.all([
    listRooms(ctx.env),
    listDmsWith(ctx.env, user.id, other.id, DM_THREAD_PAGE_SIZE, null),
    isUserActive(ctx.env, other.display_name ?? ''),
  ]);

  // Mark incoming unread as read. Fire-and-forget after read; the next page load reflects it.
  await markDmsRead(ctx.env, user.id, other.id);

  const body = renderThread({ user, other, dms: page.dms, nextBeforeId: page.nextBeforeId, isOnline, csrfToken: ctx.csrfToken, vapidPublicKey: ctx.env.VAPID_PUBLIC_KEY });
  if (_req.headers.get('hx-request') === 'true') return html(body);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: `DM: ${other.display_name ?? ''}`, body, csrfToken: ctx.csrfToken, showFab: false }));
}

export async function getNewDm(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);

  const url = new URL(req.url);
  const to = (url.searchParams.get('to') || '').trim();
  if (!to) return redirect('/dms');

  let other = await getUserByDisplayName(ctx.env, to);
  if (!other && to.startsWith('user')) {
    const fallbackId = parseInt(to.slice(4), 10);
    if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
  }
  if (!other) return html('Recipient not found', 404);
  if (other.id === user.id) return redirect('/dms');

  // Reuse the thread view; if no prior messages it just shows the empty state + compose.
  const [rooms, page, isOnline] = await Promise.all([
    listRooms(ctx.env),
    listDmsWith(ctx.env, user.id, other.id, DM_THREAD_PAGE_SIZE, null),
    isUserActive(ctx.env, other.display_name ?? ''),
  ]);

  const body = renderThread({ user, other, dms: page.dms, nextBeforeId: page.nextBeforeId, isOnline, csrfToken: ctx.csrfToken, vapidPublicKey: ctx.env.VAPID_PUBLIC_KEY });
  if (req.headers.get('hx-request') === 'true') return html(body);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: `DM: ${other.display_name ?? ''}`, body, csrfToken: ctx.csrfToken, showFab: false }));
}

export async function postDm(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);

  if (user.is_banned === 1) return html('Banned accounts cannot send messages', 403);
  const dmLimit = checkRateLimit(`dm:user:${user.id}`, DM_RATE_MAX, DM_RATE_WINDOW_MS);
  if (!dmLimit.ok) return html('Too many messages. Please slow down.', 429);

  const form = await req.formData();
  const toRaw = String(form.get('to') || '').trim();
  const toIdRaw = String(form.get('to_id') || '').trim();
  const content = String(form.get('content') || '').trim();

  if (content.length < 1 || content.length > 4000) {
    return html('Message must be 1-4000 characters', 400);
  }

  let other: User | null = null;
  if (toIdRaw) {
    const id = Number(toIdRaw);
    if (!Number.isInteger(id) || id <= 0) return html('Invalid recipient', 400);
    other = await getUserById(ctx.env, id);
  } else if (toRaw) {
    other = await getUserByDisplayName(ctx.env, toRaw);
    if (!other && toRaw.startsWith('user')) {
      const fallbackId = parseInt(toRaw.slice(4), 10);
      if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
    }
  } else {
    return html('Missing recipient', 400);
  }

  if (!other) return html('Recipient not found', 404);
  if (other.id === user.id) return html('Cannot DM yourself', 400);
  if (ctx.ironGateActive && user.posting_restricted_at && !canRestrictedMemberDm(other)) {
    return html('Your account is read-only until approved.', 403);
  }

  // Admins bypass recipient DM settings and blocks - staff must always be reachable.
  const senderIsAdmin = user.access_level === 'admin';

  // Privacy Check
  if (!senderIsAdmin && (other as any).allow_dms === 0) {
    return html('This user is not accepting direct messages.', 403);
  }
  if (!senderIsAdmin) {
    const isTargetBlocked = await isBlocked(ctx.env, other.id, user.id);
    if (isTargetBlocked) {
      return html('You cannot message this user.', 403);
    }
  }

  await createDm(ctx.env, user.id, other.id, content);

  try {
    await pushToUser(ctx.env, other.id, {
      title: `New message from ${user.display_name || 'someone'}`,
      body: content.slice(0, 100),
      url: `/dms/${encodeURIComponent(user.display_name || '')}`,
      from: user.display_name || '',
      priority: 'high',
      type: 'dm',
    });
  } catch (_) {}

  return redirect(`/dms/${encodeURIComponent(other.display_name || `user${other.id}`)}`);
}

// Topic moderation handlers (delete/restore/remove/pin/lock/move/review/warn),
// split from api/topics.ts. Logic byte-identical; routes.ts is the consumer.
import type { AppContext } from '../types';
import { isMod } from '../access';
import {
  getRoomById,
  getTopicByShortId,
  softDeleteTopic,
  removeTopic,
  restoreTopic,
  moveTopicToRoom,
  wipeTopicContent,
  softDeleteTopicIfEmpty,
  detachOwnReplies,
  wipeOwnReplies,
  insertModWarningNotification,
  createModLog,
  setTopicReviewStatus,
  togglePinTopic,
  toggleLockTopic,
  createWarning,
} from '../db';
import { requireMember, requireMod } from '../middleware';
import { html, redirect } from '../lib/http';

async function readForm(req: Request): Promise<Record<string, string>> {
  const fd = await req.formData();
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    out[k] = typeof v === 'string' ? v : '';
  });
  return out;
}

export async function postSoftDeleteTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  const mod = isMod(user);
  const isOwner = topic.user_id === user.id;
  if (!isOwner && !mod) return html('<h1>403</h1>', 403);
  const form = await readForm(req);
  const reason = (form.reason ?? '').trim() || 'no reason given';
  const action = (form.action ?? '').trim() || 'soft';

  if (isOwner && form.owner_wipe === '1') {
    const keepReplies = form.keep_replies === '1';
    await wipeTopicContent(ctx.env, topic.id);
    if (keepReplies) {
      await detachOwnReplies(ctx.env, topic.id, user.id);
    } else {
      await wipeOwnReplies(ctx.env, topic.id, user.id);
    }
    await softDeleteTopicIfEmpty(ctx.env, topic.id);
  } else if (action === 'hard') {
    await softDeleteTopic(ctx.env, topic.id, reason, user.id);
    await removeTopic(ctx.env, topic.id, user.id);
    await createModLog(ctx.env, user.id, 'hard_delete_topic', 'topic', topic.id, reason);
  } else if (action === 'remove') {
    await removeTopic(ctx.env, topic.id, user.id);
    await createModLog(ctx.env, user.id, 'remove_topic', 'topic', topic.id, reason);
  } else {
    await softDeleteTopic(ctx.env, topic.id, reason, user.id);
    await createModLog(ctx.env, user.id, 'soft_delete_topic', 'topic', topic.id, reason);
  }

  // Redirect to the room, not back to the topic - a mod can still view a
  // soft-deleted topic by URL, so returning there looks like nothing happened.
  const room = await getRoomById(ctx.env, topic.room_id);
  const dest = room ? `/r/${room.slug}` : '/';
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Redirect': dest } });
  }
  return redirect(dest);
}

export async function postRestoreTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  await restoreTopic(ctx.env, topic.id);
  await createModLog(ctx.env, user.id, 'restore_topic', 'topic', topic.id, null);
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect('/mod/deleted');
}

export async function postRemoveTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  const form = await readForm(req);
  const reason = (form.reason ?? '').trim() || 'no reason given';
  await removeTopic(ctx.env, topic.id, user.id);
  await createModLog(ctx.env, user.id, 'remove_topic', 'topic', topic.id, reason);
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  const ref = req.headers.get('referer') ?? '/';
  return redirect(ref);
}

export async function postPinTopic(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  await togglePinTopic(ctx.env, topic.id);
  return redirect(`/t/${shortId}`);
}

export async function postLockTopic(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  await toggleLockTopic(ctx.env, topic.id);
  return redirect(`/t/${shortId}`);
}

export async function postMoveTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);

  const fd = await req.formData();
  const targetRoomId = Number(fd.get('target_room_id') ?? 0);
  if (!Number.isInteger(targetRoomId) || targetRoomId <= 0) {
    return html('invalid target_room_id', 400);
  }
  if (targetRoomId === topic.room_id) {
    return html('target room is current room', 400);
  }
  const target = await getRoomById(ctx.env, targetRoomId);
  if (!target) return html('target room not found', 400);
  if ((target as any).is_archived) return html('target room is archived', 400);
  if (target.is_page) return html('target room is a page, not a forum', 400);

  const fromRoom = await getRoomById(ctx.env, topic.room_id);
  const fromSlug = fromRoom?.slug ?? `id=${topic.room_id}`;
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 200) || 'no reason given';

  await moveTopicToRoom(ctx.env, topic.id, targetRoomId);
  await createModLog(
    ctx.env,
    user.id,
    'move_topic',
    'topic',
    topic.id,
    `from=${fromSlug} to=${target.slug} reason=${reason}`,
  );

  return redirect(`/t/${shortId}`);
}

export async function postToggleTopicReview(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);

  const newVal = topic.require_review ? 0 : 1;
  await setTopicReviewStatus(ctx.env, topic.id, newVal);
  await createModLog(ctx.env, user.id, 'toggle_topic_review', 'topic', topic.id, `new_val=${newVal}`);

  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect(req.headers.get('referer') || `/t/${topic.short_id}`);
}

export async function postWarnTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!ctx.user || !isMod(ctx.user)) return html('<h1>403</h1>', 403);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  if (!topic.user_id) return html('Cannot warn: topic has no author', 400);

  const form = await readForm(req);
  const memo = String(form.memo ?? '').trim();
  if (!memo) return html('A warning message is required', 400);

  const targetContent = `${topic.title}\n\n${topic.content ?? ''}`;
  await createWarning(ctx.env, topic.user_id, ctx.user.id, 'topic', topic.id, targetContent, memo);
  await createModLog(ctx.env, ctx.user.id, 'warn_topic', 'topic', topic.id, memo);
  try {
    await insertModWarningNotification(ctx.env, topic.user_id, 'A moderator issued a warning about your topic.', '/settings/warnings');
  } catch (_) {}

  if (req.headers.get('hx-request') === 'true') {
    return new Response('', { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect(req.headers.get('referer') || `/t/${shortId}`);
}

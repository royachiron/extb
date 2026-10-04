import type { AppContext, Env } from '../types';
import { isMod, canPost } from '../access';
import {
  getTopicById,
  getRoomById,
  createPost,
  getPostById,
  updatePost,
  softDeletePost,
  removePost,
  hardDeletePost,
  restorePost,
  archivePost,
  unarchivePost,
  insertModWarningNotification,
  createModLog,
  createWarning,
  listRooms,
  getUsersByDisplayNames,
  listTopicFollowers,
  createTopicFollow,
  toggleReaction,
  getReactionsForPost,
  hasUnresolvedWarning,
  hasRecentUserContent,
  countPendingForUser,
  listCwTags,
  setPostCwTags,
  getCwTagsForPosts,
  getUserById,
} from '../db';
import { collectRecipients, createNotificationsBatch } from './notifications';
import { pushToUser } from '../lib/notify';
import { requireMember, requireMod } from '../middleware';
import { verifyTurnstile } from '../lib/turnstile';
import { renderLayout, esc, csrfField, markdownToolbar } from '../views/layout';
import { renderPost, renderEditPostForm, renderReplyPostForm } from '../views/post';
import { tagPicker } from '../views/tags';
import { checkRateLimit } from '../lib/rate-limit';

const POST_RATE_MAX = 20;
const POST_RATE_WINDOW_MS = 3_600_000;

import { html, redirect } from '../lib/http';

// HTMX: drop the post card from the thread.
function hxDropCard(id: number): Response {
  return new Response('', {
    status: 200,
    headers: { 'HX-Reswap': 'delete', 'HX-Retarget': `#post-${id}` },
  });
}

// HTMX: re-render the post card in place (e.g. soft-deleted stub).
async function hxReplacePost(ctx: AppContext, id: number, user: any): Promise<Response> {
  const updated = await getPostById(ctx.env, id);
  const topic = updated ? await getTopicById(ctx.env, updated.topic_id) : null;
  const allCwTags = updated ? await listCwTags(ctx.env) : [];
  return new Response(updated ? renderPost(updated, false, user, topic?.user_id ?? null, ctx.csrfToken, null, allCwTags) : '', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'HX-Reswap': 'outerHTML',
      'HX-Retarget': `#post-${id}`,
    },
  });
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const fd = await req.formData();
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    out[k] = typeof v === 'string' ? v : '';
  });
  return out;
}

async function mayParticipateInTopic(ctx: AppContext, topicId: number): Promise<boolean> {
  const topic = await getTopicById(ctx.env, topicId);
  if (!topic || topic.deleted_at || topic.removed_at || (topic.status !== 'approved' && topic.user_id !== ctx.user?.id && !isMod(ctx.user))) return false;
  const room = await getRoomById(ctx.env, topic.room_id, ctx.user?.id);
  return !!room && canPost(ctx.user, room);
}

export const ALLOWED_REACTIONS = ['❤️', '🫂', '👍', '🔥', '🔬', '💡'] as const;

// Intentionally distinct from views/post.ts renderReactions: this API-fragment
// twin differs in picker emoji order, aria-labels, and border color - merging
// would change rendered output (left per de-spaghetti plan twin rule).
function renderReactions(postId: number, reactions: any[], isTopic = false): string {
  const common = ALLOWED_REACTIONS;
  const prefix = isTopic ? 't' : 'p';
  const targetId = `reactions-${prefix}-${postId}`;

  const activeReactions = reactions.map(r => {
    return `<button class="reaction-btn active"
      hx-post="/p/${postId}/react"
      hx-vals='{"emoji": "${esc(r.emoji)}", "isTopic": ${isTopic}}'
      hx-target="#${targetId}"
      hx-swap="outerHTML"
      title="${esc(r.users)}"
      style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--highlight-bg);border:1px solid var(--primary-hover);border-radius:999px;font-size:13px;color:var(--primary-hover);font-weight:600;cursor:pointer;">
      <span>${esc(r.emoji)}</span><span style="font-size:11px;opacity:0.8;">${r.count}</span>
    </button>`;
  }).join('');

  const picker = common.map(e => `
    <button class="reaction-picker-btn"
      hx-post="/p/${postId}/react"
      hx-vals='{"emoji": "${esc(e)}", "isTopic": ${isTopic}}'
      hx-target="#${targetId}"
      hx-swap="outerHTML"
      style="background:none;border:none;padding:4px;cursor:pointer;font-size:16px;filter:grayscale(1);transition:filter 0.2s;"
      onmouseover="this.style.filter='none'"
      onmouseout="this.style.filter='grayscale(1)'">
      ${esc(e)}
    </button>`).join('');

  return `<div id="${targetId}" class="post-reactions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center;">
    ${activeReactions}
    <div class="reaction-picker" style="display:flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid #e5e7eb;">
      ${picker}
    </div>
  </div>`;
}

export async function postReact(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);

  const form = await readForm(req);
  const emoji = (form.emoji ?? '').trim();
  const isTopic = form.isTopic === 'true';
  if (!emoji) return html('<h1>400 - emoji required</h1>', 400);
  if (!(ALLOWED_REACTIONS as readonly string[]).includes(emoji)) {
    return html('<h1>400 - invalid reaction</h1>', 400);
  }

  const reactionPost = isTopic ? null : await getPostById(ctx.env, id);
  if ((!isTopic && (!reactionPost || reactionPost.deleted_at || reactionPost.removed_at)) || !await mayParticipateInTopic(ctx, isTopic ? id : reactionPost!.topic_id)) return html('forbidden', 403);
  await toggleReaction(ctx.env, id, user.id, emoji, isTopic);
  const reactions = await getReactionsForPost(ctx.env, id, isTopic);

  return html(renderReactions(id, reactions, isTopic));
}

export async function postReactApi(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  const form = await readForm(req);
  const emoji = (form.emoji ?? '').trim();
  const isTopic = form.isTopic === 'true';
  if (!id || !emoji) return new Response('bad req', { status: 400 });
  if (!(ALLOWED_REACTIONS as readonly string[]).includes(emoji)) {
    return new Response('bad req', { status: 400 });
  }

  const reactionPost = isTopic ? null : await getPostById(ctx.env, id);
  if ((!isTopic && (!reactionPost || reactionPost.deleted_at || reactionPost.removed_at)) || !await mayParticipateInTopic(ctx, isTopic ? id : reactionPost!.topic_id)) return html('forbidden', 403);
  await toggleReaction(ctx.env, id, user.id, emoji, isTopic);
  const reactions = await getReactionsForPost(ctx.env, id, isTopic);
  return html(renderReactions(id, reactions, isTopic));
}

export async function notifyMentionsAndFollowers(
  env: Env,
  topic: { id: number; short_id: string; title: string; user_id: number | null },
  post: { id: number; content: string; user_id: number | null },
  authorId: number
) {
  // Extract mentions
  const mentions = Array.from(post.content.matchAll(/@([a-zA-Z0-9_-]{3,32})/g)).map(m => m[1]).filter((m): m is string => !!m);
  const uniqueMentions = [...new Set(mentions)];

  const mentionUsers = uniqueMentions.length > 0
    ? await getUsersByDisplayNames(env, uniqueMentions)
    : [];
  const followers = await listTopicFollowers(env, topic.id);

  const recipients = collectRecipients(
    mentionUsers.map(u => u.id),
    followers,
    topic.user_id,
    authorId,
  );
  await createNotificationsBatch(env, recipients, post.user_id, topic.short_id, post.id);

  // Web-push the same recipients. Best-effort (pushToUser never throws) and
  // awaited because AppContext has no waitUntil. The per-topic tag makes a
  // reply storm coalesce into one visible notification per device.
  let actorName = 'Someone';
  if (post.user_id) {
    const actor = await getUserById(env, post.user_id);
    actorName = actor?.display_name || 'Someone';
  }
  const url = `/t/${topic.short_id}#post-${post.id}`;
  await Promise.all(recipients.map((r) =>
    pushToUser(env, r.userId, {
      title: r.type === 'mention'
        ? `${actorName} mentioned you in "${topic.title}"`
        : `${actorName} replied in "${topic.title}"`,
      body: post.content.slice(0, 100),
      url,
      tag: `topic-${topic.short_id}`,
      type: r.type,
    })
  ));
}

export async function postPost(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const fd = await req.formData();
  const form: Record<string, string> = {};
  fd.forEach((v, k) => { form[k] = typeof v === 'string' ? v : ''; });
  const topicId = Number(form.topic_id);
  const rawParent = String(form.parent_post_id ?? '').trim();
  const parentPostId = rawParent && Number.isFinite(Number(rawParent)) ? Number(rawParent) : null;
  const content = (form.content ?? '').trim();
  if (!Number.isFinite(topicId) || !content) return html('<h1>400</h1>', 400);
  if (content.length > 20000) return html('<h1>400 - too long</h1>', 400);

  const topic = await getTopicById(ctx.env, topicId);
  if (!topic || topic.deleted_at) return html('<h1>404</h1>', 404);

  const room = await getRoomById(ctx.env, topic.room_id, ctx.user?.id);
  if (!room) return html('<h1>404</h1>', 404);
  if (!canPost(ctx.user, room)) return html('forbidden', 403);

  if (room.min_post === 'anon' && !ctx.user) {
    if (topic.is_locked) return html('<h1>403 - thread locked</h1>', 403);
    const token = String(form['cf-turnstile-response'] ?? '');
    const ip = req.headers.get('cf-connecting-ip');
    if (!(await verifyTurnstile(ctx.env, token, ip))) {
      return html('<h1>403 - verification failed</h1>', 403);
    }
    const anonName = String(form.anon_name ?? '').trim() || 'anonymous';
    await createPost(ctx.env, topicId, null, anonName, content, 'pending', parentPostId);
    return redirect(`/t/${topic.short_id}?submitted=1`);
  }

  const user = requireMember(ctx);
  if (topic.is_locked && !isMod(user)) return html('<h1>403 - thread locked</h1>', 403);
  if (!canPost(user, room, ctx.ironGateActive)) return html('<h1>403</h1>', 403);

  if (!isMod(user)) {
    const postLimit = checkRateLimit(`post:user:${user.id}`, POST_RATE_MAX, POST_RATE_WINDOW_MS);
    if (!postLimit.ok) return html('<h1>429 - Too many posts. Please slow down.</h1>', 429);
  }

  if (await hasUnresolvedWarning(ctx.env, user.id) && await hasRecentUserContent(ctx.env, user.id)) {
    const msg = 'You have an active moderator warning. You may post once per hour until it is resolved. See <a href="/settings/warnings">/settings/warnings</a>.';
    if (req.headers.get('hx-request') === 'true') {
      return new Response(`<div class="flash flash-warn" style="margin:8px 0;">${msg}</div>`, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'HX-Retarget': 'closest .reply-composer',
          'HX-Reswap': 'afterbegin',
        },
      });
    }
    return html(`<h1>429</h1><p>${msg}</p>`, 429);
  }

  let status: 'approved' | 'pending' = 'approved';
  if (!isMod(user)) {
    if (topic.require_review === 1 || user.require_review === 1) {
      if (user.require_review === 1) {
        const pendingCount = await countPendingForUser(ctx.env, user.id);
        if (pendingCount >= 3) {
          return html('<h1>429 - You have reached the maximum of 3 pending submissions. Please wait for a moderator to review them.</h1>', 429);
        }
      }
      status = 'pending';
    }
  }

  const post = await createPost(ctx.env, topicId, user.id, null, content, status, parentPostId);

  const cwTagIds = fd.getAll('cw_tag_ids').map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0);
  if (cwTagIds.length > 0) await setPostCwTags(ctx.env, post.id, cwTagIds);

  if (status === 'pending') {
    if (req.headers.get('hx-request') === 'true') {
      return new Response('<div class="flash flash-success">Reply submitted and awaiting moderator review.</div>', {
        headers: { 'content-type': 'text/html; charset=utf-8', 'HX-Trigger': 'reply-submitted' }
      });
    }
    return redirect(`/t/${topic.short_id}?submitted=1`);
  }

  try { await createTopicFollow(ctx.env, topicId, user.id); } catch (_) {}
  try { await notifyMentionsAndFollowers(ctx.env, topic as any, post, user.id); } catch (_) {}

  if (req.headers.get('hx-request') === 'true') {
    const allCwTags = await listCwTags(ctx.env);
    const tagMap = cwTagIds.length > 0 ? await getCwTagsForPosts(ctx.env, [post.id]) : new Map();
    const postWithTags = { ...post, author_display_name: user.display_name, cw_tags: tagMap.get(post.id) ?? [] };
    return html(renderPost(postWithTags, false, user, topic.user_id, ctx.csrfToken, null, allCwTags));
  }

  return redirect(`/t/${topic.short_id}#post-${post.id}`);
}

export async function postSoftDeletePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);
  const mod = isMod(user);
  const isOwner = post.user_id === user.id;
  if (!isOwner && !mod) return html('<h1>403</h1>', 403);

  const form = await readForm(req);
  const reason = (form.reason ?? '').trim() || 'no reason given';
  const action = (form.action ?? '').trim() || 'soft';

  if (!mod) {
    // Owner always hard-deletes their own post
    await hardDeletePost(ctx.env, id);
  } else if (action === 'hard') {
    // Permanent: erase the row. Gone from the thread and from /mod/deleted.
    await createModLog(ctx.env, user.id, 'hard_delete_post', 'post', id, reason);
    await hardDeletePost(ctx.env, id);
  } else if (action === 'remove') {
    await removePost(ctx.env, id, user.id);
    await createModLog(ctx.env, user.id, 'remove_post', 'post', id, reason);
  } else {
    // soft (default)
    await softDeletePost(ctx.env, id, reason, user.id);
    await createModLog(ctx.env, user.id, 'soft_delete_post', 'post', id, reason);
  }

  if (req.headers.get('hx-request') === 'true') {
    // Hard delete / remove / owner delete drops the card; mod soft delete
    // re-renders it in place as the deleted stub.
    const removedFromThread = !mod || action === 'hard' || action === 'remove';
    return removedFromThread ? hxDropCard(id) : hxReplacePost(ctx, id, user);
  }
  const ref = req.headers.get('referer') ?? '/';
  return redirect(ref);
}

export async function postRestorePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);
  await restorePost(ctx.env, id);
  await createModLog(ctx.env, user.id, 'restore_post', 'post', id, null);
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect('/mod/deleted');
}

export async function postRemovePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);
  const form = await readForm(req);
  const reason = (form.reason ?? '').trim() || 'no reason given';
  await removePost(ctx.env, id, user.id);
  await createModLog(ctx.env, user.id, 'remove_post', 'post', id, reason);
  if (req.headers.get('hx-request') === 'true') {
    return hxDropCard(id);
  }
  const ref = req.headers.get('referer') ?? '/';
  return redirect(ref);
}

export async function getEditPostForm(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post || post.deleted_at) return html('<h1>404</h1>', 404);
  if (post.user_id !== user.id && !isMod(user)) return html('<h1>403</h1>', 403);
  if (!await mayParticipateInTopic(ctx, post.topic_id)) return html('<h1>403</h1>', 403);

  const isHtmx = req.headers.get('hx-request') === 'true';

  const [allCwTags, tagMap] = await Promise.all([
    listCwTags(ctx.env),
    getCwTagsForPosts(ctx.env, [id]),
  ]);
  const selectedIds = (tagMap.get(id) ?? []).map((t: any) => t.id);

  const form = renderEditPostForm({ csrfToken: ctx.csrfToken, post, allCwTags, selectedIds });

  if (isHtmx) return html(form);

  const all = await listRooms(ctx.env);
  const rooms = all.filter((r) => !r.is_page);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user, rooms, title: 'Edit post', body: form, csrfToken: ctx.csrfToken }));
}

export async function getReplyPostForm(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post || post.deleted_at) return html('<h1>404</h1>', 404);

  const topic = await getTopicById(ctx.env, post.topic_id);
  if (!topic || topic.deleted_at || topic.is_locked && !isMod(user)) return html('<h1>403</h1>', 403);
  if (!await mayParticipateInTopic(ctx, post.topic_id)) return html('<h1>403</h1>', 403);

  const allCwTags = await listCwTags(ctx.env);

  const form = renderReplyPostForm({ csrfToken: ctx.csrfToken, post, topic, allCwTags });

  return html(form);
}

export async function postUpdatePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post || post.deleted_at) return html('<h1>404</h1>', 404);
  if (post.user_id !== user.id && !isMod(user)) return html('<h1>403</h1>', 403);
  if (!await mayParticipateInTopic(ctx, post.topic_id)) return html('<h1>403</h1>', 403);

  const fd = await req.formData();
  const form: Record<string, string> = {};
  fd.forEach((v, k) => { form[k] = typeof v === 'string' ? v : ''; });
  const content = (form.content ?? '').trim();
  if (!content) return html('<h1>400 - content required</h1>', 400);
  if (content.length > 20000) return html('<h1>400 - too long</h1>', 400);

  const cwTagIds = fd.getAll('cw_tag_ids').map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0);
  await updatePost(ctx.env, id, content);
  await setPostCwTags(ctx.env, id, cwTagIds);

  const topic = await getTopicById(ctx.env, post.topic_id);
  if (req.headers.get('hx-request') === 'true') {
    const allCwTags = await listCwTags(ctx.env);
    const tagMap = await getCwTagsForPosts(ctx.env, [id]);
    const postWithTags = { ...post, content, author_display_name: user.display_name, cw_tags: tagMap.get(id) ?? [] };
    return html(renderPost(postWithTags, false, user, topic?.user_id, ctx.csrfToken, null, allCwTags));
  }

  return redirect(`/t/${topic?.short_id || post.topic_id}#post-${post.id}`);
}

export async function postBatchDeletePosts(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMod(ctx);
  const fd = await req.formData();
  const ids = fd.getAll('ids').map(Number).filter(n => Number.isFinite(n) && n > 0);
  const action = String(fd.get('action') ?? 'soft').trim();
  for (const id of ids) {
    if (action === 'hard') {
      await hardDeletePost(ctx.env, id);
    } else if (action === 'remove') {
      await removePost(ctx.env, id, user.id);
    } else {
      await softDeletePost(ctx.env, id, 'batch deleted by mod', user.id);
    }
  }
  if (ids.length > 0) {
    await createModLog(ctx.env, user.id, `batch_${action}_post`, 'post', null, `ids: ${ids.join(',')}`);
  }
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect(`/t/${params.id}`);
}

export async function postArchivePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!ctx.user || !isMod(ctx.user)) return html('<h1>403</h1>', 403);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);

  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);

  const form = await readForm(req);
  const memo = String(form.memo ?? '').trim();
  const sendWarning = form.send_warning === '1';

  // Archive the post
  await archivePost(ctx.env, id, ctx.user.id);

  await createModLog(ctx.env, ctx.user.id, 'archive_post', 'post', id, memo || 'no memo');

  if (sendWarning && post.user_id) {
    await createWarning(ctx.env, post.user_id, ctx.user.id, 'post', id, post.content ?? '', memo);
    try {
      await insertModWarningNotification(ctx.env, post.user_id, 'A moderator issued a warning about your post.', '/settings#warnings');
    } catch (_) {}
  }

  if (req.headers.get('hx-request') === 'true') {
    return new Response('', { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect('/mod/deleted');
}

export async function postWarnPost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!ctx.user || !isMod(ctx.user)) return html('<h1>403</h1>', 403);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);

  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);
  if (!post.user_id) return html('Cannot warn: post has no author', 400);

  const form = await readForm(req);
  const memo = String(form.memo ?? '').trim();
  if (!memo) return html('A warning message is required', 400);

  await createWarning(ctx.env, post.user_id, ctx.user.id, 'post', id, post.content ?? '', memo);
  await createModLog(ctx.env, ctx.user.id, 'warn_post', 'post', id, memo);
  try {
    await insertModWarningNotification(ctx.env, post.user_id, 'A moderator issued a warning about your post.', '/settings/warnings');
  } catch (_) {}

  if (req.headers.get('hx-request') === 'true') {
    return new Response('', { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect(req.headers.get('referer') || '/');
}

export async function postUnarchivePost(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('<h1>404</h1>', 404);
  const post = await getPostById(ctx.env, id);
  if (!post) return html('<h1>404</h1>', 404);
  await unarchivePost(ctx.env, id);
  await createModLog(ctx.env, user.id, 'unarchive_post', 'post', id, null);
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, { status: 200, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect('/mod/deleted');
}

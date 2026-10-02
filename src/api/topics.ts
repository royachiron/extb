import { DEFAULT_BRANDING } from '../lib/branding';
import type { AppContext, Room, Topic } from '../types';
import { isMod, canRead, canPost } from '../access';
import {
  listRooms,
  getRoomBySlug,
  getRoomById,
  listFeedTopics,
  listUnansweredTopics,
  UNANSWERED_WINDOW_DAYS,
  listFeedTopicsForMod,
  listRoomsForIndex,
  getLatestReplies,
  getTopContributors,
  getTopicById,
  getTopicByShortId,
  listPostsForTopicPage,
  decodeCursor,
  createTopic,
  updateTopic,
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
  countPendingForUser,
  setTopicReviewStatus,
  togglePinTopic,
  toggleLockTopic,
  createTopicFollow,
  deleteTopicFollow,
  isFollowingTopic,
  createPoll,
  getPollByTopicId,
  voteInPoll,
  getPollVotesByUser,
  getReactionsForPost,
  getReactionsForPosts,
  upsertLastVisit,
  upsertTopicRead,
  markAllThreadsRead,
  upsertPresence,
  createWarning,
  hasUnresolvedWarning,
  hasRecentUserContent,
  listCwTags,
  setTopicCwTags,
  getCwTagsForTopics,
  getCwTagsForPosts,
  logForumView,
} from '../db';
import { renderFeed, renderTopicCards, renderForumIndex, renderNeedsYou, renderFeedMore, FEED_PAGE_SIZE } from '../views/feed';
import { renderTopic, renderPostList, renderLoadMorePosts, renderEditTopicForm, renderFollowButton, renderFollowingButton } from '../views/topic';
import { renderNewTopicComposer, renderRoomTopicComposer } from '../views/post';
import { renderLayout, esc, csrfField, markdownToolbar } from '../views/layout';
import { tagPicker } from '../views/tags';
import { requireMember, requireMod } from '../middleware';
import { verifyTurnstile } from '../lib/turnstile';
import { onboardingRedirect } from '../middleware';

import { html, redirect } from '../lib/http';

export async function getFeed(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(req.url);
  const slug = _params?.slug || url.searchParams.get('room');
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10) || 0);
  const onboardingGate = onboardingRedirect(ctx, slug === 'introductions');
  if (onboardingGate) return onboardingGate;
  const all = await listRooms(ctx.env, ctx.user?.id);
  const rooms = all.filter((r) => !r.is_page);
  const mod = isMod(ctx.user);

  let activeRoom: Room | null = null;
  let topics;
  if (slug) {
    activeRoom = await getRoomBySlug(ctx.env, slug, ctx.user?.id);
    if (!activeRoom || activeRoom.is_page) return html('<h1>404</h1>', 404);
    if ((activeRoom as any).kind === 'chat') return redirect(`/chat?room=${encodeURIComponent(activeRoom.slug)}`);
    if (!canRead(ctx.user, activeRoom)) {
      // Anons / unverified users bounce to FAQ. ?verify=1 makes the page show a
      // register-or-verify warning so the user knows why they were redirected.
      if (!ctx.user || !ctx.user.is_approved) return redirect('/login', 302);
      if (ctx.user.access_level === 'member' && !activeRoom.is_page && activeRoom.min_read === 'full') {
        return html('<h1><!--extb-ui-->Trusted membership is required for this room.<!--/extb-ui--></h1>', 403);
      }
      return html('<h1>403 - locked room</h1>', 403);
    }

    if (ctx.user) {
      await upsertLastVisit(ctx.env, ctx.user.id, activeRoom.id);
    }
    const pName = ctx.user?.display_name || ctx.user?.email?.split('@')[0] || 'guest';
    await upsertPresence(ctx.env, pName, Date.now(), activeRoom.id);

    topics = mod
      ? await listFeedTopicsForMod(ctx.env, activeRoom.id, FEED_PAGE_SIZE + 1, page * FEED_PAGE_SIZE, ctx.user?.id)
      : await listFeedTopics(ctx.env, activeRoom.id, FEED_PAGE_SIZE + 1, page * FEED_PAGE_SIZE, ctx.user?.id);
  } else {
    topics = mod
      ? await listFeedTopicsForMod(ctx.env, null, FEED_PAGE_SIZE + 1, page * FEED_PAGE_SIZE, ctx.user?.id)
      : await listFeedTopics(ctx.env, null, FEED_PAGE_SIZE + 1, page * FEED_PAGE_SIZE, ctx.user?.id);
  }

  const hasMore = topics.length > FEED_PAGE_SIZE;
  if (hasMore) topics = topics.slice(0, FEED_PAGE_SIZE);

  if (topics.length > 0) {
    const tagMap = await getCwTagsForTopics(ctx.env, topics.map((t: any) => t.id));
    for (const t of topics as any[]) t.cw_tags = tagMap.get(t.id) ?? [];
  }

  const baseUrl = activeRoom ? `/r/${activeRoom.slug}` : '/';
  const pollUrl = `${baseUrl}?list=1`;

  if (url.searchParams.get('list') === '1' && req.headers.get('hx-request') === 'true') {
    if (url.searchParams.get('append') === '1') {
      // Load-more: replace #feed-more (the request target) and OOB-append the
      // next page of cards inside #topic-list.
      return html(
        `${renderFeedMore(baseUrl, hasMore ? page + 1 : null)}` +
        `<div hx-swap-oob="beforeend:#topic-list">${renderTopicCards(topics, ctx.user, rooms)}</div>`
      );
    }
    return html(renderTopicCards(topics, ctx.user, rooms));
  }

  const gate = false;
  const body = (!ctx.user ? `<div class="community-welcome"><h1>${esc((ctx.branding || DEFAULT_BRANDING).name)}</h1><p>${esc((ctx.branding || DEFAULT_BRANDING).homepage_copy)}</p></div>` : '') + renderFeed({ user: ctx.user, rooms, activeRoom, topics, pollUrl, siteKey: ctx.env.TURNSTILE_SITE_KEY, csrfToken: ctx.csrfToken, gate, ironGateActive: ctx.ironGateActive, hasMore, baseUrl, page });

  if (req.headers.get('hx-request') === 'true') {
    return html(body);
  }

  const roomDesc = activeRoom?.description
    ? `${activeRoom.name} forum. ${activeRoom.description.substring(0, 130)}`
    : undefined;

  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
    user: ctx.user,
    rooms: all,
    activeRoomSlug: activeRoom?.slug || undefined,
    title: activeRoom ? activeRoom.name : (ctx.branding?.name || 'EXTB'),
    body,
    csrfToken: ctx.csrfToken,
    canonicalUrl: activeRoom ? `/r/${activeRoom.slug}` : '/',
    description: roomDesc,
  }));
}

export async function getForumIndex(
  req: Request,
  ctx: AppContext
): Promise<Response> {
  const onboardingGate = onboardingRedirect(ctx);
  if (onboardingGate) return onboardingGate;

  try {
    try { await logForumView(ctx.env, ctx.user?.id ?? null); } catch (_) {}
    const all = await listRooms(ctx.env, ctx.user?.id);
    const [indexRooms, topTopics, latestReplies, topContributors] = await Promise.all([
      listRoomsForIndex(ctx.env, ctx.user?.id),
      listFeedTopics(ctx.env, null, 5, 0, ctx.user?.id),
      getLatestReplies(ctx.env, 5, ctx.user?.id),
      getTopContributors(ctx.env, 5, ctx.user?.id),
    ]);
    const body = renderForumIndex({ user: ctx.user, rooms: indexRooms, topTopics, latestReplies, topContributors });
    if (req.headers.get('hx-request') === 'true') return html(body);
    return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms: all, title: 'Forum Index', body, csrfToken: ctx.csrfToken, canonicalUrl: '/' }));
  } catch (err) {
    console.error('getForumIndex error:', err);
    return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}

/**
 * Needs You: threads nobody has answered that this viewer can actually reply to.
 *
 * The SQL only answers "can this person see it". Whether they can *answer* it is
 * canPost(), which folds in membership, rank and per-user room overrides and
 * is not expressible in SQL - so it is applied here in TS over the candidate
 * window. That keeps one source of truth for posting rights (src/access.ts) and
 * stops the queue offering threads with no reply path: prod has rooms that are
 * readable at 'member' but postable only at 'full'.
 */
export async function getNeedsYou(
  req: Request,
  ctx: AppContext
): Promise<Response> {
  const onboardingGate = onboardingRedirect(ctx);
  if (onboardingGate) return onboardingGate;

  // Gate parity with /forum: anons and unverified users land on the FAQ.
  if (!ctx.user || !ctx.user.is_approved) {
    return redirect('/about/community', 302);
  }
  // Hoisted out of ctx so the non-null narrowing survives into the filter
  // closure below. A null user reaching canPost would fail OPEN via its
  // room.min_post === 'anon' branch.
  const user = ctx.user;

  try {
    const all = await listRooms(ctx.env, user.id);
    const [candidates, topTopics, latestReplies, topContributors] = await Promise.all([
      listUnansweredTopics(ctx.env, user.id),
      listFeedTopics(ctx.env, null, 5, 0, user.id),
      getLatestReplies(ctx.env, 5, user.id),
      getTopContributors(ctx.env, 5, ctx.user?.id),
    ]);

    // `all` comes from listRooms(env, userId), which projects user_permission -
    // canPost reads that for its per-user override branches, and a missing value
    // would fail OPEN for a user holding an explicit 'read'/'blocked' grant.
    const roomById = new Map(all.map((r) => [r.id, r]));
    const topics = candidates.filter((t) => {
      const room = roomById.get(t.room_id);
      return !!room && canPost(user, room, ctx.ironGateActive);
    });

    if (topics.length > 0) {
      const tagMap = await getCwTagsForTopics(ctx.env, topics.map((t: any) => t.id));
      for (const t of topics as any[]) t.cw_tags = tagMap.get(t.id) ?? [];
    }

    const body = renderNeedsYou({
      user,
      rooms: all,
      topics,
      windowDays: UNANSWERED_WINDOW_DAYS,
      topTopics,
      latestReplies,
      topContributors,
    });
    if (req.headers.get('hx-request') === 'true') return html(body);
    return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user,
      rooms: all,
      title: 'Needs you',
      body,
      csrfToken: ctx.csrfToken,
      canonicalUrl: '/needs-you',
    }));
  } catch (err) {
    console.error('getNeedsYou error:', err);
    return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}

// How many top-level posts (with their full subtrees) per thread page.
const TOPIC_PAGE_SIZE = 50;

/**
 * Shared topic-visibility gate for the full page and the /t/:id/posts partial:
 * short-id lookup, review-mode/deleted/status checks, room read access,
 * onboarding redirect. Returns a Response when the viewer must be bounced.
 */
async function loadVisibleTopic(
  ctx: AppContext,
  shortId: string,
): Promise<{ topic: Topic; room: Room; mod: boolean } | Response> {
  if (!shortId) return html('<h1>404</h1>', 404);
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);

  // Visibility Check: Review Mode
  const isAuthor = ctx.user && topic.user_id === ctx.user.id;
  const mod = isMod(ctx.user);
  if (topic.require_review && !isAuthor && !mod) {
    return html('<h1>This topic is under moderator review.</h1><p>It is currently hidden from the public.</p>', 403);
  }

  if ((topic.deleted_at || topic.removed_at) && !mod) return html('<h1>404</h1>', 404);
  if ((topic as any).status !== 'approved' && !mod) return html('<h1>404</h1>', 404);

  const room = await getRoomById(ctx.env, topic.room_id, ctx.user?.id);
  if (!room) return html('<h1>404</h1>', 404);
  const onboardingGate = onboardingRedirect(ctx, room.slug === 'introductions');
  if (onboardingGate) return onboardingGate;
  if (!canRead(ctx.user, room)) {
    if (!ctx.user || !ctx.user.is_approved) return redirect('/login');
    if (ctx.user.access_level === 'member' && !room.is_page && room.min_read === 'full') {
      return html('<h1><!--extb-ui-->Trusted membership is required for this room.<!--/extb-ui--></h1>', 403);
    }
    return html('<h1>403</h1>', 403);
  }

  return { topic, room, mod };
}

/** Hydrate reactions + CW tags onto one page of posts. */
async function hydratePosts(ctx: AppContext, posts: any[]): Promise<void> {
  if (posts.length === 0) return;
  const ids = posts.map((p: any) => p.id);
  const [reactionsByPost, postTagMap] = await Promise.all([
    getReactionsForPosts(ctx.env, ids),
    getCwTagsForPosts(ctx.env, ids),
  ]);
  for (const p of posts as any[]) {
    p.reactions = reactionsByPost.get(p.id) ?? [];
    p.cw_tags = postTagMap.get(p.id) ?? [];
  }
}

/**
 * GET /t/:id/posts?after=<cursor> - next thread page. Response replaces the
 * #post-more control and OOB-appends the posts into #post-list.
 */
export async function getTopicPosts(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const loaded = await loadVisibleTopic(ctx, String(params.id || ''));
  if (loaded instanceof Response) return loaded;
  const { topic, room, mod } = loaded;

  const after = decodeCursor(new URL(req.url).searchParams.get('after'));
  if (!after) return html('bad cursor', 400);

  const { posts, nextCursor } = await listPostsForTopicPage(ctx.env, topic.id, TOPIC_PAGE_SIZE, after, mod);
  await hydratePosts(ctx, posts);

  const mayPost = canPost(ctx.user, room, ctx.ironGateActive);
  const listHtml = renderPostList(posts, topic, ctx.user, ctx.csrfToken ?? '', await listCwTags(ctx.env), mayPost);
  return html(
    `${renderLoadMorePosts(topic.short_id, nextCursor)}<div hx-swap-oob="beforeend:#post-list">${listHtml}</div>`
  );
}

export async function getTopic(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const loaded = await loadVisibleTopic(ctx, String(params.id || ''));
  if (loaded instanceof Response) return loaded;
  const { topic, room, mod } = loaded;

  if (ctx.user) {
    await upsertLastVisit(ctx.env, ctx.user.id, room.id);
    await upsertTopicRead(ctx.env, ctx.user.id, topic.id);
  }
  const pName = ctx.user?.display_name || ctx.user?.email?.split('@')[0] || 'guest';
  await upsertPresence(ctx.env, pName, Date.now(), room.id);

  const { posts, nextCursor } = await listPostsForTopicPage(ctx.env, topic.id, TOPIC_PAGE_SIZE, null, mod);

  // Load reactions for all posts in a single batched query
  const reactionsByPost = await getReactionsForPosts(ctx.env, posts.map((p: any) => p.id));
  for (const p of posts as any[]) {
    p.reactions = reactionsByPost.get(p.id) ?? [];
  }

  // Load reactions for the TOPIC itself (OP)
  (topic as any).reactions = await getReactionsForPost(ctx.env, topic.id, true);

  // Attach CW tags to topic OP and replies
  const topicTagMap = await getCwTagsForTopics(ctx.env, [topic.id]);
  (topic as any).cw_tags = topicTagMap.get(topic.id) ?? [];
  if (posts.length > 0) {
    const postTagMap = await getCwTagsForPosts(ctx.env, posts.map((p: any) => p.id));
    for (const p of posts as any[]) (p as any).cw_tags = postTagMap.get(p.id) ?? [];
  }

  const isFollowing = ctx.user ? await isFollowingTopic(ctx.env, topic.id, ctx.user.id) : false;
  
  const poll = await getPollByTopicId(ctx.env, topic.id);
  let userVotes: number[] = [];
  if (poll && ctx.user) {
    userVotes = await getPollVotesByUser(ctx.env, poll.id, ctx.user.id);
  }

  const all = await listRooms(ctx.env, ctx.user?.id);
  const allRooms = all.filter(r => !r.is_page && r.id !== topic.room_id);
  const allCwTags = await listCwTags(ctx.env);
  const body = renderTopic({ topic, posts, isFollowing, user: ctx.user, room, poll, userVotes, csrfToken: ctx.csrfToken ?? '', siteKey: ctx.env.TURNSTILE_SITE_KEY, allCwTags, allRooms, ironGateActive: ctx.ironGateActive, nextCursor });

  if (_req.headers.get('hx-request') === 'true') {
    return html(body);
  }

  const firstPostContent = (topic as any).content || '';
  const topicDesc = firstPostContent.replace(/[#*`_>[\]!]/g, '').replace(/\n+/g, ' ').substring(0, 155).trim();

  const topicJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': `${ctx.origin}/t/${topic.short_id}`,
    url: `${ctx.origin}/t/${topic.short_id}`,
    headline: topic.title,
    text: topicDesc,
    author: { '@type': 'Person', name: topic.author_display_name || 'anonymous' },
    datePublished: (topic.created_at || '').replace(' ', 'T') + (topic.created_at?.includes('T') ? '' : 'Z'),
    dateModified: (topic.last_reply_at || topic.created_at || '').replace(' ', 'T') + 'Z',
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/ReplyAction',
      userInteractionCount: topic.reply_count || 0
    },
    isPartOf: { '@type': 'WebSite', '@id': `${ctx.origin}/#website` }
  });

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms: all,
      activeRoomSlug: room.slug,
      title: topic.title,
      body,
      csrfToken: ctx.csrfToken,
      canonicalUrl: `/t/${topic.short_id}`,
      description: topicDesc || (room ? `${room.name} discussion in your community.` : undefined),
      jsonLd: topicJsonLd,
      noindex: room.is_locked ? true : undefined,
      showFab: false,
      })
  );
}

export async function postTopic(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const fd = await req.formData();
  const form: Record<string, string> = {};
  fd.forEach((v, k) => { form[k] = typeof v === 'string' ? v : ''; });
  const roomId = Number(form.room_id);
  const title = (form.title ?? '').trim();
  const content = (form.content ?? '').trim();
  const tags = (form.tags ?? '').trim() || null;

  if (!Number.isFinite(roomId) || !title) {
    return html('<h1>400 - title and room required</h1>', 400);
  }
  if (title.length > 200 || content.length > 20000) {
    return html('<h1>400 - too long</h1>', 400);
  }

  const room = await getRoomById(ctx.env, roomId);
  if (!room) return html('<h1>404</h1>', 404);
  if (room.is_page) return html('<h1>400 - use page route</h1>', 400);

  if (room.min_post === 'anon' && !ctx.user) {
    const token = String(form['cf-turnstile-response'] ?? '');
    const ip = req.headers.get('cf-connecting-ip');
    if (!(await verifyTurnstile(ctx.env, token, ip))) {
      return html('<h1>403 - verification failed</h1>', 403);
    }
    const anonName = String(form.anon_name ?? '').trim() || 'anonymous';
    const topic = await createTopic(ctx.env, roomId, null, anonName, title, content, tags, 'pending', 0);
    return redirect(`/r/${room.slug}?submitted=1`);
  }

  const user = requireMember(ctx);
  if (!canPost(user, room, ctx.ironGateActive)) return html('<h1>403</h1>', 403);

  if (await hasUnresolvedWarning(ctx.env, user.id) && await hasRecentUserContent(ctx.env, user.id)) {
    return html('<h1>429 - You have an active moderator warning. You may post once per hour until it is resolved.</h1>', 429);
  }

  let status: 'approved' | 'pending' = 'approved';
  if (user.require_review === 1 && !isMod(user)) {
    const pendingCount = await countPendingForUser(ctx.env, user.id);
    if (pendingCount >= 3) {
      return html('<h1>429 - You have reached the maximum of 3 pending submissions. Please wait for a moderator to review them.</h1>', 429);
    }
    status = 'pending';
  }

  const topic = await createTopic(ctx.env, roomId, user.id, null, title, content, tags, status, form.delete_on_approve === '1' ? 1 : 0);

  const cwTagIds = fd.getAll('cw_tag_ids').map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0);
  if (cwTagIds.length > 0) await setTopicCwTags(ctx.env, topic.id, cwTagIds);

  const pollQuestion = (form.poll_question ?? '').trim();
  const pollOptions = (form.poll_options ?? '').split('\n').map(o => o.trim()).filter(o => !!o);
  if (pollQuestion && pollOptions.length >= 2) {
    const multiSelect = form.poll_multi === '1';
    const endsAt = form.poll_ends_at || null;
    await createPoll(ctx.env, topic.id, pollQuestion, multiSelect, endsAt, pollOptions);
  }

  if (status === 'pending') {
    return redirect(`/r/${room.slug}?submitted=1`);
  }

  return redirect(`/t/${topic.short_id}`);
}

export async function getNewTopic(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const slug = new URL(req.url).searchParams.get('room');
  const prefillTitle = new URL(req.url).searchParams.get('title') ?? '';
  const prefillBody  = new URL(req.url).searchParams.get('body')  ?? '';
  const [all, allCwTags] = await Promise.all([listRooms(ctx.env, ctx.user?.id), listCwTags(ctx.env)]);
  const postRooms = all.filter(r => !r.is_page && canPost(user, r, ctx.ironGateActive));
  const preselected = slug ? postRooms.find(r => r.slug === slug) : null;

  const showAutoDelete = preselected && preselected.slug === 'introductions';
  const isHtmx = req.headers.get('hx-request') === 'true';
  const body = renderNewTopicComposer({ csrfToken: ctx.csrfToken, preselected, postRooms, prefillTitle, prefillBody, showAutoDelete, allCwTags });

  if (isHtmx) return html(body);

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user,
      rooms: all,
      activeRoomSlug: preselected?.slug,
      title: 'New Topic',
      body,
      csrfToken: ctx.csrfToken,
      showFab: false,
    })
  );
}

export async function getNewTopicForm(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const slug = new URL(req.url).searchParams.get('room');
  if (!slug) return html('<h1>400 - room required</h1>', 400);
  const room = await getRoomBySlug(ctx.env, slug, user.id);
  if (!room || room.is_page) return html('<h1>404</h1>', 404);
  if (!canPost(user, room, ctx.ironGateActive)) return html('<h1>403</h1>', 403);

  const allCwTags = await listCwTags(ctx.env);

  const showAutoDelete = room.slug === 'introductions';
  const isHtmx = req.headers.get('hx-request') === 'true';
  const body = renderRoomTopicComposer({ csrfToken: ctx.csrfToken, room, showAutoDelete, allCwTags });

  if (isHtmx) return html(body);

  const all = await listRooms(ctx.env, ctx.user?.id);
  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user,
      rooms: all,
      activeRoomSlug: room.slug,
      title: 'New Topic',
      body,
      csrfToken: ctx.csrfToken,
      showFab: false,
    })
  );
}

export async function getEditTopicForm(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic || topic.deleted_at) return html('<h1>404</h1>', 404);
  if (topic.user_id !== user.id && !isMod(user)) return html('<h1>403</h1>', 403);

  const [allCwTags, editTagMap] = await Promise.all([
    listCwTags(ctx.env),
    getCwTagsForTopics(ctx.env, [topic.id]),
  ]);
  const selectedTagIds = (editTagMap.get(topic.id) ?? []).map((t: any) => t.id);

  const isHtmx = req.headers.get('hx-request') === 'true';
  const body = renderEditTopicForm({ csrfToken: ctx.csrfToken, topic, allCwTags, selectedTagIds });

  if (isHtmx) return html(body);

  const all = await listRooms(ctx.env, ctx.user?.id);
  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user,
      rooms: all,
      title: `Edit topic - ${topic.title}`,
      body,
      csrfToken: ctx.csrfToken,
    })
  );
}

export async function postUpdateTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic || topic.deleted_at) return html('<h1>404</h1>', 404);
  if (topic.user_id !== user.id && !isMod(user)) return html('<h1>403</h1>', 403);

  const editFd = await req.formData();
  const form: Record<string, string> = {};
  editFd.forEach((v, k) => { form[k] = typeof v === 'string' ? v : ''; });
  const title = (form.title ?? '').trim();
  const content = (form.content ?? '').trim();
  const tags = (form.tags ?? '').trim() || null;
if (!title || !content) return html('<h1>400 - title and content required</h1>', 400);
if (title.length > 200 || content.length > 20000) return html('<h1>400 - too long</h1>', 400);

await updateTopic(ctx.env, topic.id, title, content, tags);

const editCwTagIds = editFd.getAll('cw_tag_ids').map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0);
await setTopicCwTags(ctx.env, topic.id, editCwTagIds);

const target = `/t/${topic.short_id}`;
if (req.headers.get('hx-request') === 'true') {
  return new Response(null, { status: 200, headers: { 'HX-Redirect': target } });
}
return redirect(target);
}

export async function postFollowTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  await createTopicFollow(ctx.env, topic.id, user.id);

  if (req.headers.get('hx-request') === 'true') {
    return html(renderFollowingButton(topic.short_id));
  }

  return redirect(`/t/${topic.short_id}`);
}

export async function postUnfollowTopic(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  await deleteTopicFollow(ctx.env, topic.id, user.id);

  if (req.headers.get('hx-request') === 'true') {
    return html(renderFollowButton(topic.short_id));
  }

  return redirect(`/t/${topic.short_id}`);
}

export async function postPollVote(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const shortId = String(params.id || '');
  const topic = await getTopicByShortId(ctx.env, shortId);
  if (!topic) return html('<h1>404</h1>', 404);
  
  const poll = await getPollByTopicId(ctx.env, topic.id);
  if (!poll) return html('<h1>404 - Poll not found</h1>', 404);

  // Check if poll has ended
  if (poll.ends_at && new Date(poll.ends_at.replace(' ', 'T') + 'Z') < new Date()) {
    return html('<h1>400 - Poll has ended</h1>', 400);
  }

  const fd = await req.formData();
  const optionIds = fd.getAll('option').map(o => Number(o)).filter(o => Number.isFinite(o));
  
  if (optionIds.length === 0) return html('<h1>400 - Choose at least one option</h1>', 400);
  if (!poll.multi_select && optionIds.length > 1) return html('<h1>400 - Choose only one option</h1>', 400);

  await voteInPoll(ctx.env, poll.id, optionIds, user.id);

  if (req.headers.get('hx-request') === 'true') {
    return getTopic(req, ctx, params);
  }

  return redirect(`/t/${topic.short_id}`);
}

export async function markRead(_req: Request, ctx: AppContext): Promise<Response> {
  if (!ctx.user) return new Response(null, { status: 401 });
  await markAllThreadsRead(ctx.env, ctx.user.id);
  // HTMX full refresh so every unread indicator recomputes from the new watermark.
  return new Response(null, { status: 204, headers: { 'HX-Refresh': 'true' } });
}

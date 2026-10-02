import type { AppContext, ChatMessage } from '../types';
import { listRooms, getRoomBySlug, getChatMessages, listChatMessagesSince, getReplyParent, createChatMessage, deleteChatMessage, getLastChatMessageTime, upsertPresence, getActivePresence, getUserByDisplayName, getUserById, isBlocked, getChatReactionCounts, listBadgesForUser } from '../db';
import { canRead, canPost, isMod as isModUser } from '../access';
import { renderChatUserMenu } from '../views/chat-user-menu';
import { chatDockRooms, renderChatDockPlaceholder } from '../views/chat-dock';
import { renderChat, linkifyChat, renderChatParticipants } from '../views/chat';
import { esc, renderLayout } from '../views/layout';
import { requireMod } from '../middleware';
import { onboardingRedirect } from '../middleware';
import { chatReplyExcerpt } from '../lib/chat-format';
import { chatBubble, chatHeader, chatReactionPill, chatAddBtn, chatReplyBtn, chatNick, chatMeRest, chatActionBody, chatIsMention, chatMarkMention } from '../views/chat-message';
import { isBotCommand, botCommandBranch } from '../lib/bot-copy';
import { renderBotPanel } from '../views/bot';
import { botEnabled, botName } from '../lib/bot';
import { signChatAuth } from '../lib/chat-auth';

// Server-side render of the reactions row under a chat message body. `reactions`
// is the grouped list for this message (may be undefined/empty). emoji are
// whitelisted but still esc()'d defensively.
function renderChatReactions(
  messageId: number,
  reactions: { emoji: string; count: number; userIds: number[] }[] | undefined,
  viewerId: number | null,
): string {
  // Pills only - the `.chat-reactions` wrapper now lives in chatBubble so both
  // render paths emit it identically.
  return (reactions ?? [])
    .filter(r => r.count > 0)
    .map(r => {
      const mine = viewerId != null && r.userIds.includes(viewerId);
      return chatReactionPill(messageId, esc(r.emoji), r.count, mine);
    }).join('');
}

function deriveChatSlug(url: URL, fd?: FormData): string {
  return (url.searchParams.get('room') || (fd?.get('room') as string) || 'chat').trim() || 'chat';
}

import { html, redirect } from '../lib/http';

export async function getChat(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const gate = onboardingRedirect(ctx);
  if (gate) return gate;

  const rooms = await listRooms(ctx.env, ctx.user?.id);
  // Chat-room switcher: only kind='chat' rooms this user can read.
  const chatRooms = rooms.filter(r => r.kind === 'chat' && canRead(ctx.user, r));
  const requestedSlug = new URL(req.url).searchParams.get('room');
  const activeSlug = requestedSlug ?? chatRooms.find(r => r.slug === 'chat')?.slug ?? chatRooms[0]?.slug ?? 'chat';
  const chatRoom = await getRoomBySlug(ctx.env, activeSlug, ctx.user?.id);
  if (!chatRoom || chatRoom.kind !== 'chat' || !canRead(ctx.user, chatRoom)) {
    if (!ctx.user || !ctx.user.is_approved) return redirect('/login');
    return redirect('/r/introductions?gate=1');
  }
  // Chat lives in the always-open dock for these users. Rendering it into
  // .main as well would duplicate every chat element id and open a second
  // socket, so /chat just shows a placeholder and opens the dock.
  if (chatDockRooms(ctx.user, rooms).length) {
    const placeholder = renderChatDockPlaceholder();
    if (req.headers.get('hx-request') === 'true') {
      return new Response(placeholder, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'HX-Trigger': 'chatDockOpen' },
      });
    }
    return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'chat',
      title: 'Chat',
      body: placeholder,
      csrfToken: ctx.csrfToken,
      showFab: false,
      openChatDock: new URL(req.url).searchParams.get('room') ?? '',
    }));
  }

  try {
    const now = new Date().toISOString();

    const showBot = await botEnabled(ctx);
    const body = renderChat({ user: ctx.user, csrfToken: ctx.csrfToken, rooms: chatRooms, activeSlug, botName: showBot ? await botName(ctx) : undefined });

    const layoutBody = req.headers.get('hx-request') === 'true'
      ? body
      : renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
          user: ctx.user,
          rooms,
          activeRoomSlug: 'chat',
          title: '',
          body,
          csrfToken: ctx.csrfToken,
          showFab: false,
        });

    const resp = html(layoutBody);
    const headers = new Headers(resp.headers);
    headers.append('Set-Cookie', `chat_last_view=${now}; Path=/; Max-Age=31536000; SameSite=Lax`);
    return new Response(resp.body, { status: resp.status, headers });
  } catch (e: any) {
    console.error('Chat render error:', e.message, e.stack);
    return html('<h1>Something went wrong rendering chat.</h1>', 500);
  }
}

export async function getChatMessagesApi(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const slug = deriveChatSlug(url);
  const chatRoom = await getRoomBySlug(ctx.env, slug, ctx.user?.id);
  if (!chatRoom || chatRoom.kind !== 'chat' || !canRead(ctx.user, chatRoom)) return html('forbidden', 403);
  const scope = 'room:' + slug;

  const now = Date.now();
  const sinceId = Number(url.searchParams.get('since') || '0');

  // Heartbeat: upsert presence for this poll (gated above, ctx.user guaranteed)
  const name: string = ctx.user!.display_name ?? ctx.user!.email?.split('@')[0] ?? 'member';
  await upsertPresence(ctx.env, name, now, chatRoom.id);

  const [messages, activeNames] = await Promise.all([
    sinceId > 0
      ? listChatMessagesSince(ctx.env, sinceId, scope)
      : getChatMessages(ctx.env, 50, scope),
    getActivePresence(ctx.env, undefined, chatRoom.id),
  ]);

  const isMod = ctx.user && ['mod', 'admin'].includes(ctx.user.access_level);
  // Batch reaction counts for the rendered messages (one IN-query). viewerId
  // lets us mark the viewer's own reactions .is-mine so reloads stay highlighted.
  const reactionMap = await getChatReactionCounts(ctx.env, messages.map(m => m.id));
  const viewerId = ctx.user?.id ?? null;
  const messageItems = messages.map(m => {
        const utc = m.created_at.includes('T') ? m.created_at : m.created_at.replace(' ', 'T') + 'Z';
        const delBtn = isMod
          ? `<button class="chat-del-btn" hx-post="/chat/messages/${m.id}/delete" hx-swap="none" style="display:none;background:none;border:none;color:#ef4444;font-size:16px;font-weight:700;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;" title="Delete">✕</button>`
          : '';
        const viewerName = ctx.user!.display_name || ctx.user!.email?.split('@')[0] || '';
        const isMe = m.author_name === viewerName;
        const replyQuote = m.reply_to_id
          ? `<div class="chat-reply-quote">↳ <span class="chat-reply-author">${esc(m.reply_to_author ?? '')}</span>: ${esc(m.reply_to_excerpt ?? '')}</div>`
          : '';
        // Same rules as the live client path (chatMainScript buildMsgHtml):
        // others' names open the name menu; /me renders as an action line.
        const guest = m.author_name.startsWith('[guest]');
        const meRest = chatMeRest(m.content);
        const headerHtml = chatHeader({
          authorHtml: isMe || guest ? esc(m.author_name) : chatNick(esc(m.author_name)),
          timeHtml: new Date(utc).toLocaleTimeString(),
          utc,
          addBtnHtml: chatAddBtn(m.id),
          replyBtnHtml: chatReplyBtn(m.id, esc(m.author_name)),
          delBtnHtml: delBtn,
        });
        const bubble = chatBubble({
          id: m.id,
          isMe,
          headerHtml,
          quoteHtml: replyQuote,
          bodyHtml: meRest !== null ? chatActionBody(esc(m.author_name), linkifyChat(meRest, ctx.origin)) : linkifyChat(m.content, ctx.origin),
          reactionsHtml: renderChatReactions(m.id, reactionMap.get(m.id), viewerId),
        });
        return chatIsMention(m.content, viewerName, m.author_name) ? chatMarkMention(bubble) : bubble;
      }).join('');
  const messagesHtml = messages.length > 0
    ? `<div hx-swap-oob="beforeend:#chat-messages">${messageItems}</div>`
    : '';

  const participantsHtml = renderChatParticipants(activeNames);

  if (sinceId === 0) {
    // Clear loading placeholder on first load
    const clearLoader = `<div id="chat-loading-placeholder" hx-swap-oob="delete"></div>`;
    return html(clearLoader + messagesHtml + participantsHtml);
  }
  return html(messagesHtml + participantsHtml);
}

export async function postChatMessageApi(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const fd = await req.formData();
  const url = new URL(req.url);
  const slug = deriveChatSlug(url, fd);
  // Ensure slug is on the URL query so the chained getChatMessagesApi read
  // (which calls deriveChatSlug(url) without fd) sees the same room.
  url.searchParams.set('room', slug);
  const chatRoom = await getRoomBySlug(ctx.env, slug, ctx.user?.id);
  if (!chatRoom || chatRoom.kind !== 'chat' || !canPost(ctx.user, chatRoom, ctx.ironGateActive)) return html('forbidden', 403);
  const scope = 'room:' + slug;

  const ip = req.headers.get('cf-connecting-ip');
  const author_name = ctx.user!.display_name || ctx.user!.email?.split('@')[0] || '';

  const content = (fd.get('content') as string || '').trim().substring(0, 500);
  if (!content) return html('Message required.', 400);

  // /bot is a private helper command, never a room message. The normal client
  // intercepts it before sending; this guard covers the degraded HTTP path so
  // the command can never land in the room. Bot disabled -> plain text.
  if (isBotCommand(content) && await botEnabled(ctx)) {
    return html(renderBotPanel(botCommandBranch(content), { variant: 'chat', botName: await botName(ctx) }));
  }

  // Cooldown: 2s verified members (gate ensures email_verified=1)
  const lastTime = await getLastChatMessageTime(ctx.env, author_name, ip, scope);
  const now = Date.now();
  const cooldownMs = 2000;

  if (now - lastTime < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
    return html(`Wait ${remaining} seconds...`, 429);
  }

  // Quote/reply (degraded HTTP path): validate the parent in THIS scope, then
  // denormalize author+excerpt. Same scope-guard as the DO; any miss -> normal send.
  let replyToId: number | null = null;
  let replyToAuthor: string | null = null;
  let replyToExcerpt: string | null = null;
  const replyRaw = Number(fd.get('reply_to'));
  if (Number.isFinite(replyRaw) && replyRaw > 0) {
    const parent = await getReplyParent(ctx.env, replyRaw, scope);
    if (parent) {
      replyToId = replyRaw;
      replyToAuthor = parent.author_name;
      replyToExcerpt = chatReplyExcerpt(parent.content);
    }
  }

  await createChatMessage(ctx.env, author_name, content, ip, scope, ctx.user?.id ?? null, replyToId, replyToAuthor, replyToExcerpt);
  await upsertPresence(ctx.env, author_name, now, chatRoom.id);

  // Pass a request built from the mutated url (room always in query) so the
  // chained getChatMessagesApi derives the same slug regardless of how the
  // original request delivered it (query vs form body).
  return getChatMessagesApi(new Request(url.toString(), { headers: req.headers }), ctx, _params);
}

/**
 * GET /chat/user/:name - the chat name menu fragment (whois card + actions).
 * Fetched by the chat client when a nick is clicked. Members only: auth is
 * checked before any lookup, and a fetch() can't follow a login redirect, so
 * anything else is a plain 403 the client turns into a short notice.
 */
export async function getChatUserMenu(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  if (!ctx.user || onboardingRedirect(ctx)) return html('forbidden', 403);
  const viewer = ctx.user;
  const name = params.name ?? '';
  let target = await getUserByDisplayName(ctx.env, name);
  if (!target && name.startsWith('user')) {
    const fallbackId = parseInt(name.slice(4), 10);
    if (!isNaN(fallbackId)) target = await getUserById(ctx.env, fallbackId);
  }
  if (!target) return html('not found', 404);

  const self = target.id === viewer.id;
  const [badges, blocked] = await Promise.all([
    listBadgesForUser(ctx.env, target.id),
    self ? Promise.resolve(false) : isBlocked(ctx.env, viewer.id, target.id),
  ]);
  return html(renderChatUserMenu({ target, badges, viewer, viewerIsMod: isModUser(viewer), blocked }));
}

export async function handleChatWebSocket(req: Request, ctx: AppContext): Promise<Response> {
  // Cross-site WebSocket hijacking guard: cookies ride along on a WS upgrade,
  // so reject upgrades whose Origin is not our own host.
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) {
        return new Response('Forbidden origin', { status: 403 });
      }
    } catch {
      return new Response('Forbidden origin', { status: 403 });
    }
  }
  if (req.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  // Same gates as GET /chat: onboarding/ban/verify bounce first, then room read
  // permission. onboardingRedirect returns a redirect Response for users the
  // page would bounce (banned -> /appeal, unverified, no display_name); for a WS
  // upgrade we translate any such bounce into a 403.
  if (onboardingRedirect(ctx)) {
    return new Response('Forbidden', { status: 403 });
  }

  // DM mode: ?dm=<displayName|user<id>>. Transport-only - the dms table stays the
  // source of truth; this socket only carries a real-time SIGNAL so the recipient
  // pokes GET /api/dms/<name>/messages (server-rendered markdown) instead of
  // waiting on the 20s poll. Scope + recipient are SERVER-derived from the two
  // real user ids; nothing here is client-trusted.
  const dmRaw = url.searchParams.get('dm');
  if (dmRaw !== null) {
    // requireMember predicate, inlined - requireMember throws *redirects*, which
    // we cannot send on a WS upgrade, so translate every member-gate miss to 403.
    const me = ctx.user;
    if (!me || me.is_banned || !me.is_approved || !me.display_name) {
      return new Response('Forbidden', { status: 403 });
    }

    // Resolve the other user: display name first, then the user<id> fallback.
    let other = await getUserByDisplayName(ctx.env, dmRaw);
    if (!other && dmRaw.startsWith('user')) {
      const fallbackId = parseInt(dmRaw.slice(4), 10);
      if (!isNaN(fallbackId)) other = await getUserById(ctx.env, fallbackId);
    }
    if (!other) return new Response('Forbidden', { status: 403 });
    if (other.id === me.id) return new Response('Forbidden', { status: 403 });
    // Admins bypass recipient DM settings and blocks, mirroring postDm.
    const meIsAdmin = me.access_level === 'admin';
    if (!meIsAdmin && (other as any).allow_dms === 0) return new Response('Forbidden', { status: 403 });
    // Sender blocked by recipient -> no channel (mirrors postDm's isBlocked(other,me)).
    if (!meIsAdmin && (await isBlocked(ctx.env, other.id, me.id))) {
      return new Response('Forbidden', { status: 403 });
    }

    // Canonical, order-independent DM scope from the two real ids.
    const a = Math.min(me.id, other.id);
    const b = Math.max(me.id, other.id);
    const dmScope = 'dm:' + a + ':' + b;

    const myName = me.display_name || me.email?.split('@')[0] || '[guest]';
    const dmUrl = new URL(req.url);
    dmUrl.searchParams.set('name', myName);
    // Member already past the gate above -> may post + relay typing in this DM.
    dmUrl.searchParams.set('post', '1');
    dmUrl.searchParams.set('mod', '0');
    dmUrl.searchParams.set('ip', req.headers.get('cf-connecting-ip') ?? '');
    dmUrl.searchParams.set('since', url.searchParams.get('since') ?? '0');
    dmUrl.searchParams.set('scope', dmScope);
    dmUrl.searchParams.set('author_id', String(me.id));
    // Recipient hints so the DO resolves names without trusting the client. The
    // DO still derives the recipient id from the scope; these are a cross-check.
    dmUrl.searchParams.set('dm_other_id', String(other.id));
    dmUrl.searchParams.set('dm_other_name', other.display_name ?? '');
    dmUrl.searchParams.set('do_auth', await signChatAuth(ctx.env.CHAT_DO_SECRET, me.id, dmScope, false, true));

    const dmId = ctx.env.CHAT_ROOM.idFromName(dmScope);
    const dmStub = ctx.env.CHAT_ROOM.get(dmId);
    return dmStub.fetch(new Request(dmUrl.toString(), req));
  }

  // Client may request a room via ?room=<slug>; the worker validates it and
  // builds the scope itself. Only server-built strings reach idFromName.
  const slug = deriveChatSlug(url);
  const chatRoom = await getRoomBySlug(ctx.env, slug, ctx.user?.id);
  if (!chatRoom || chatRoom.kind !== 'chat' || !canRead(ctx.user, chatRoom)) {
    return new Response('Forbidden', { status: 403 });
  }
  const scope = 'room:' + slug;

  // Identity - derived server-side, mirroring getChat / postChatMessageApi.
  // postChatMessageApi (line 153) builds author_name as
  //   ctx.user!.display_name || ctx.user!.email?.split('@')[0] || ''
  // but asserts ctx.user; here ctx.user may be a guest (canRead allows anon),
  // so guard it and fall back to the DO's own '[guest]' convention
  // (durable/chat-room.ts:49 / the '[guest]' strip in this file's presence list).
  const name = ctx.user
    ? (ctx.user.display_name || ctx.user.email?.split('@')[0] || 'member' || '[guest]')
    : '[guest]';
  // mod predicate copied from getChatMessagesApi (line 95); falsy for guests.
  const isMod = !!(ctx.user && ['mod', 'admin'].includes(ctx.user.access_level));
  const mayPost = canPost(ctx.user, chatRoom, ctx.ironGateActive);
  // ip expression from postChatMessageApi (line 152), lowercase header name.
  const ip = req.headers.get('cf-connecting-ip');
  const since = url.searchParams.get('since') ?? '0';

  // Forward the upgrade to the single global ChatRoom, identity in the query.
  const doUrl = new URL(req.url);
  doUrl.searchParams.set('name', name);
  doUrl.searchParams.set('mod', isMod ? '1' : '0');
  doUrl.searchParams.set('post', mayPost ? '1' : '0');
  doUrl.searchParams.set('ip', ip ?? '');
  doUrl.searchParams.set('since', since);
  doUrl.searchParams.set('scope', scope);
  doUrl.searchParams.set('author_id', ctx.user?.id ? String(ctx.user.id) : '');
  doUrl.searchParams.set('do_auth', await signChatAuth(ctx.env.CHAT_DO_SECRET, ctx.user?.id ?? null, scope, isMod, mayPost));

  // One DO instance per scope; switching rooms is a full page nav (one WS/page).
  const id = ctx.env.CHAT_ROOM.idFromName(scope);
  const stub = ctx.env.CHAT_ROOM.get(id);
  // new Request(url, req) carries the Upgrade header + method from the original.
  return stub.fetch(new Request(doUrl.toString(), req));
}

export async function postDeleteChatMessageApi(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  requireMod(ctx);
  const id = Number(params.id);
  if (!Number.isFinite(id)) return html('bad req', 400);
  await deleteChatMessage(ctx.env, id);
  return html(`<div id="chat-msg-${id}" hx-swap-oob="delete"></div>`);
}

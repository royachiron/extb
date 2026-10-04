import { canSendMemberDm, decorateMembershipUser } from '../lib/membership-policy';
import { canRead, canPost, isMod } from '../access';
import { getUserById } from '../db/users';
import { getRoomBySlug } from '../db/rooms';
import { isBlocked } from '../db/blocks';
import { getSetting } from '../db/settings';
import type { Env, User, Room } from '../types';
import { createDm, toggleChatReaction, getChatReactionCounts, countChatReaction } from '../db';
import { chatReplyExcerpt } from '../lib/chat-format';
import {
  selectChatBacklog,
  insertChatMessage,
  softDeleteChatMessage,
  getReplyParent,
  getChatMessageScope,
  type ChatRow,
} from '../db/chat-messages';
import { pushToUser } from '../lib/notify';
import { isBotCommand } from '../lib/bot-copy';
import { verifyChatAuth } from '../lib/chat-auth';

// Fixed server-side emoji whitelist for ROOM chat reactions. Restricting to this
// set means an arbitrary string can never be rendered as an "emoji". MUST match
// the client ALLOWED_REACTIONS array in views/chat.ts.
const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

interface SocketMeta {
  name: string;
  isMod: boolean;
  canPost: boolean;
  ip: string | null;
  // Server-built scope ('room:<slug>' or 'dm:<minId>:<maxId>'), keys this DO
  // instance + DB rows. Old hibernated sockets predate this field - always
  // default on read.
  scope: string;
  authorId: number | null;
  // DM transport hints (server-supplied by handleChatWebSocket; null for rooms).
  // dmOtherId is a cross-check only - the recipient is derived from `scope`.
  dmOtherId: number | null;
  dmOtherName: string | null;
}

interface ClientMsg {
  type: 'send' | 'delete' | 'typing' | 'react';
  content?: string;
  id?: number;
  // Quote/reply: client may reference a parent message id (validated + scoped server-side).
  replyToId?: number;
  // Typing indicator: ephemeral, no persistence.
  on?: boolean;
  // Reaction: emoji must be in ALLOWED_REACTIONS (server-checked).
  emoji?: string;
}

const MAX_LEN = 500;
const DM_MAX_LEN = 4000;
const COOLDOWN_MS = 2000;
const BACKLOG_LIMIT = 50;

export class ChatRoom {
  private ctx: DurableObjectState;
  private env: Env;
  // In-memory cooldown tracker, keyed by name|ip. Resets if the DO hibernates;
  // acceptable because the window is only 2s and abuse requires a live socket.
  private lastSend = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    // Keepalive pings are answered without waking the DO from hibernation.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }
    const url = new URL(req.url);
    const authorIdRaw = url.searchParams.get('author_id');
    const authorId = authorIdRaw && Number.isFinite(Number(authorIdRaw)) ? Number(authorIdRaw) : null;
    const dmOtherRaw = url.searchParams.get('dm_other_id');
    const dmOtherId = dmOtherRaw && Number.isFinite(Number(dmOtherRaw)) ? Number(dmOtherRaw) : null;
    const meta: SocketMeta = {
      name: url.searchParams.get('name') || '[guest]',
      isMod: url.searchParams.get('mod') === '1',
      canPost: url.searchParams.get('post') === '1',
      ip: url.searchParams.get('ip') || null,
      // Scope is server-built by the worker (handleChatWebSocket); never client-trusted.
      scope: url.searchParams.get('scope') || 'room:chat',
      authorId,
      dmOtherId,
      dmOtherName: url.searchParams.get('dm_other_name') || null,
    };
    const since = Number(url.searchParams.get('since')) || 0;

    // Independent authorization: prove the Worker (not a client) built this
    // request. Without this the DO fully trusts name/mod/post/scope/author_id
    // straight off the query string - safe only as long as the single caller
    // (handleChatWebSocket) is the only path in. This closes that single point
    // of failure so a future mistaken call site can't reopen it silently.
    const doAuth = url.searchParams.get('do_auth') ?? '';
    const secret = this.env.CHAT_DO_SECRET || (await getSetting(this.env, 'chat_auth_secret'))?.value || '';
    if (!secret) return new Response('Forbidden', { status: 403 });
    const authOk = await verifyChatAuth(secret, doAuth, meta.authorId, meta.scope, meta.isMod, meta.canPost);
    if (!authOk) return new Response('Forbidden', { status: 403 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernatable accept: webSocket* handlers fire even after eviction.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(meta);

    await this.sendBacklog(server, since, meta.scope, meta.authorId);
    await this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  private async sendBacklog(ws: WebSocket, since: number, scope: string, authorId: number | null): Promise<void> {
    // DM scope: the full thread is already server-rendered on the page and DM
    // bodies are markdown (rendered server-side, not here). The client pokes the
    // poll endpoint on open to catch anything since render, so send no backlog.
    if (scope.startsWith('dm:')) {
      ws.send(JSON.stringify({ type: 'backlog', messages: [] }));
      return;
    }
    const rows: ChatRow[] = await selectChatBacklog(this.env, scope, since, BACKLOG_LIMIT);
    // Attach existing reaction counts so a page reload paints pre-existing
    // reactions (the live {type:'reaction'} path only covers updates after open).
    // ROOM scope only; DM backlog returned empty above. Additive field - old
    // clients ignore it, same pattern as author_id / reply_to_* on these rows.
    const ids = rows.map((r) => r.id);
    const reactionMap = await getChatReactionCounts(this.env, ids);
    const out = rows.map((r) => ({
      ...r,
      reactions: (reactionMap.get(r.id) ?? []).map((g) => ({
        emoji: g.emoji,
        count: g.count,
        // authorId null for guests -> mine=false. userIds never hits the wire.
        mine: authorId != null && g.userIds.includes(authorId),
      })),
    }));
    ws.send(JSON.stringify({ type: 'backlog', messages: out }));
  }

  /** Socket attachments survive hibernation. Recheck mutable authorization before each write. */
  private async refreshAuthorization(ws: WebSocket, meta: SocketMeta, scope: string): Promise<boolean> {
    const user = meta.authorId == null ? null : await decorateMembershipUser(this.env, await getUserById(this.env, meta.authorId));
    meta.isMod = false;
    meta.canPost = false;
    ws.serializeAttachment(meta);
    if (meta.authorId != null && (!user || user.is_banned || !user.is_approved || !user.display_name)) {
      ws.serializeAttachment(meta);
      return false;
    }
    if (scope.startsWith('dm:')) {
      if (!user) return false;
      const parts = scope.split(':');
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      if (parts.length !== 3 || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 1 || y < 1 || x === y || (user.id !== x && user.id !== y)) return false;
      const recipientId = user.id === x ? y : x;
      if (meta.dmOtherId != null && meta.dmOtherId !== recipientId) return false;
      const recipient = await getUserById(this.env, recipientId);
      if (!recipient) return false;
      const admin = user.access_level === 'admin';
      if (!admin && (recipient.allow_dms === 0 || await isBlocked(this.env, recipientId, user.id))) return false;
      meta.canPost = canSendMemberDm(user, recipient);
      meta.name = user.display_name!;
      ws.serializeAttachment(meta);
      return true;
    }
    if (!scope.startsWith('room:')) return false;
    const room = await getRoomBySlug(this.env, scope.slice(5), user?.id);
    if (!room || room.kind !== 'chat' || !canRead(user, room)) {
      ws.serializeAttachment(meta);
      return false;
    }
    meta.isMod = isMod(user);
    meta.canPost = canPost(user, room);
    if (user) meta.name = user.display_name!;
    ws.serializeAttachment(meta);
    return true;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (!meta) return;
    // Old hibernated sockets predate scope/authorId/dm* - default to keep them working.
    const scope = meta.scope ?? 'room:chat';
    const authorId = meta.authorId ?? null;
    const dmOtherId = meta.dmOtherId ?? null;
    const isDm = scope.startsWith('dm:');

    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }

    if (['send', 'delete', 'react', 'typing'].includes(msg.type)) {
      if (!await this.refreshAuthorization(ws, meta, scope)) {
        ws.send(JSON.stringify({ type: 'error', message: 'You no longer have access here.' }));
        try { ws.close(1008, 'Access revoked'); } catch {}
        return;
      }
    }

    if (msg.type === 'send') {
      if (!meta.canPost) {
        ws.send(JSON.stringify({ type: 'error', message: 'You cannot post here.' }));
        return;
      }
      // DMs allow longer bodies (matches the HTTP postDm 4000 cap); rooms stay 500.
      const maxLen = scope.startsWith('dm:') ? DM_MAX_LEN : MAX_LEN;
      const content = (msg.content ?? '').trim().slice(0, maxLen);
      if (!content) return;

      // Belt-and-suspenders: /bot never persists as a room message. The client
      // intercepts the command before it reaches the socket; this catches any
      // client that sends it anyway (DMs excluded - there it's just text).
      if (!isDm && isBotCommand(content)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Bot commands are private - nothing was posted. The helper opens in your own view.' }));
        return;
      }

      const key = meta.name + '|' + (meta.ip ?? '');
      const now = Date.now();
      // Prune expired entries so the map stays bounded to recent senders.
      for (const [k, ts] of this.lastSend) {
        if (now - ts >= COOLDOWN_MS) this.lastSend.delete(k);
      }
      const last = this.lastSend.get(key) ?? 0;
      if (now - last < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
        ws.send(JSON.stringify({ type: 'error', message: `Wait ${remaining}s before sending again.` }));
        return;
      }
      this.lastSend.set(key, now);

      // DM scope: transport-only. Persist via createDm (dms table, NOT
      // chat_messages), broadcast a lightweight signal so connected sockets
      // poke the server-rendered poll endpoint, and web-push if the recipient
      // is offline. Reply/quote is ignored (dms has no reply columns).
      if (isDm) {
        if (authorId == null) return; // can't derive recipient without sender id
        // Recipient = the scope id that is NOT the sender. Server-derived from
        // the canonical 'dm:a:b' scope; never from any client field.
        const parts = scope.split(':');
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const recipientId = x === authorId ? y : x;
        if (recipientId === authorId) return;
        // dmOtherId is a cross-check hint; if present it must match the derived id.
        if (dmOtherId != null && dmOtherId !== recipientId) return;

        let row: { id: number; created_at: string };
        try {
          row = await createDm(this.env, authorId, recipientId, content);
        } catch (e: any) {
          ws.send(JSON.stringify({ type: 'error', message: e?.message || 'Send failed.' }));
          return;
        }

        // Signal both ends (sender echo + recipient if connected). Body is sent
        // so an optimistic client could use it, but the canonical render comes
        // from the poke -> getThreadMessages (server-side markdown).
        await this.broadcast({
          type: 'message',
          id: row.id,
          author_id: authorId,
          author_name: meta.name,
          created_at: row.created_at,
          content,
        });

        // Offline push: if no live socket in THIS instance belongs to the
        // recipient, fire a web-push so they get a heads-up. meta.name is the
        // sender, so the recipient taps through to the sender's thread.
        let recipientOnline = false;
        for (const sock of this.ctx.getWebSockets()) {
          const m = sock.deserializeAttachment() as SocketMeta | null;
          if (m && (m.authorId ?? null) === recipientId) { recipientOnline = true; break; }
        }
        if (!recipientOnline) {
          this.ctx.waitUntil(pushToUser(this.env, recipientId, {
            title: 'New message from ' + meta.name,
            body: content.slice(0, 100),
            url: '/dms/' + encodeURIComponent(meta.name),
            from: meta.name,
            priority: 'high',
            type: 'dm',
          }));
        }
        return;
      }

      // Quote/reply: validate the parent in THIS scope. A reply can only quote a
      // live (non-deleted) message in the same room - scope-guard prevents
      // crafting a reply that quotes another room's message by id. On any miss
      // (wrong room / deleted / missing) we silently drop the reply fields and
      // store a normal message; never error.
      let replyToId: number | null = null;
      let replyToAuthor: string | null = null;
      let replyToExcerpt: string | null = null;
      if (typeof msg.replyToId === 'number' && Number.isFinite(msg.replyToId) && msg.replyToId > 0) {
        const parent = await getReplyParent(this.env, msg.replyToId, scope);
        if (parent) {
          replyToId = msg.replyToId;
          replyToAuthor = parent.author_name;
          replyToExcerpt = chatReplyExcerpt(parent.content);
        }
      }

      const row = await insertChatMessage(this.env, {
        author_name: meta.name,
        content,
        ip: meta.ip,
        scope,
        author_id: authorId,
        reply_to_id: replyToId,
        reply_to_author: replyToAuthor,
        reply_to_excerpt: replyToExcerpt,
      });
      if (row) await this.broadcast({ type: 'message', ...row });
    } else if (msg.type === 'typing') {
      // Ephemeral typing relay - no DB, no timer. Read-only viewers cannot emit.
      if (!meta.canPost) return;
      await this.broadcastExcept(ws, { type: 'typing', name: meta.name, on: !!msg.on });
    } else if (msg.type === 'delete') {
      if (!meta.isMod || !msg.id) return;
      // Soft delete, scope-guarded: a mod in room A cannot delete room B's
      // message via a crafted id (scope is server-pinned on this socket).
      const changes = await softDeleteChatMessage(this.env, msg.id, scope);
      if (changes > 0) await this.broadcast({ type: 'delete', id: msg.id });
    } else if (msg.type === 'react') {
      // Emoji reactions are ROOM-only and require a logged-in author. Guests and
      // DMs are ignored silently (additive protocol; no error on miss).
      if (isDm) return;
      if (authorId == null || !meta.canPost) return;
      if (typeof msg.id !== 'number' || !Number.isFinite(msg.id) || msg.id <= 0) return;
      const emoji = msg.emoji;
      if (typeof emoji !== 'string' || !ALLOWED_REACTIONS.includes(emoji)) return;
      // Scope-guard: confirm the target message lives in THIS socket's room. A
      // crafted id from another room is rejected (cannot react to / reveal it).
      const targetScope = await getChatMessageScope(this.env, msg.id);
      if (targetScope !== scope) return;
      await toggleChatReaction(this.env, msg.id, authorId, emoji);
      // Recompute the authoritative count for this (message, emoji) and fan out.
      // Each client tracks its own toggled state; count===0 removes the pill.
      const count = await countChatReaction(this.env, msg.id, emoji);
      await this.broadcast({ type: 'reaction', id: msg.id, emoji, count });
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    this.ctx.waitUntil(this.broadcastPresence(ws));
    // Complete the closing handshake. With compat date 2024-09-23 the server
    // does not auto-reply to a client close, so without this the socket lingers
    // in CLOSING. Reserved codes (1005/1006) throw if passed to close() - fall
    // back to a codeless close.
    try {
      ws.close(code, reason);
    } catch {
      try { ws.close(); } catch { /* already closed */ }
    }
  }

  webSocketError(ws: WebSocket): void {
    this.ctx.waitUntil(this.broadcastPresence(ws));
    try { ws.close(1011, 'error'); } catch { /* already closed */ }
  }

  /** Two bounded queries authorize a fanout, independent of connected socket count. */
  private async authorizedSockets(exclude?: WebSocket): Promise<WebSocket[]> {
    const sockets = this.ctx.getWebSockets().filter(ws => ws !== exclude);
    if (!sockets.length) return [];
    const attachments = sockets.map(ws => ({ ws, meta: ws.deserializeAttachment() as SocketMeta | null }));
    const scope = attachments.find(item => item.meta)?.meta?.scope ?? 'room:chat';
    const ids = [...new Set(attachments.flatMap(item => item.meta?.authorId != null ? [item.meta.authorId] : []))];
    let room: Room | null = null;
    if (scope.startsWith('room:')) room = await getRoomBySlug(this.env, scope.slice(5));
    // JSON avoids D1's 100 bound-parameter limit and one query per recipient.
    const result = ids.length ? await this.env.DB.prepare(
      `SELECT u.id, u.display_name, u.access_level, u.is_banned, u.is_approved,
              rp.access_type AS user_permission FROM users u
       LEFT JOIN room_permissions rp ON rp.user_id = u.id AND rp.room_id = ?
       WHERE u.id IN (SELECT value FROM json_each(?))`
    ).bind(room?.id ?? 0, JSON.stringify(ids)).all<User & { user_permission: Room['user_permission'] }>() : { results: [] };
    const users = new Map(result.results.map(user => [user.id, user]));
    const allowed: WebSocket[] = [];
    for (const { ws, meta } of attachments) {
      const user = meta?.authorId != null ? users.get(meta.authorId) : null;
      const member = !!user && !user.is_banned && !!user.is_approved && !!user.display_name;
      const sameScope = !!meta && (meta.scope ?? 'room:chat') === scope;
      const readable = sameScope && (scope.startsWith('dm:')
        ? member && scope.split(':').slice(1).map(Number).includes(user!.id)
        : !!room && room.kind === 'chat' && (meta!.authorId == null || member) && canRead(user ?? null, { ...room, user_permission: user?.user_permission ?? null }));
      if (!readable) {
        try { ws.close(1008, 'Access revoked'); } catch { /* socket already closed */ }
        continue;
      }
      allowed.push(ws);
    }
    return allowed;
  }

  private async broadcast(obj: unknown): Promise<void> {
    const data = JSON.stringify(obj);
    for (const ws of await this.authorizedSockets()) {
      try { ws.send(data); } catch { /* socket closing */ }
    }
  }

  private async broadcastExcept(sender: WebSocket, obj: unknown): Promise<void> {
    const data = JSON.stringify(obj);
    for (const ws of await this.authorizedSockets(sender)) {
      try { ws.send(data); } catch { /* socket closing */ }
    }
  }

  private async broadcastPresence(exclude?: WebSocket): Promise<void> {
    const sockets = await this.authorizedSockets(exclude);
    const names = new Set<string>();
    for (const ws of sockets) {
      const meta = ws.deserializeAttachment() as SocketMeta | null;
      if (meta?.name) names.add(meta.name);
    }
    const data = JSON.stringify({ type: 'presence', users: [...names] });
    for (const ws of sockets) {
      try { ws.send(data); } catch { /* socket closing */ }
    }
  }
}

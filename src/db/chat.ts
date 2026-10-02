import type { ChatMessage, Env } from '../types';
import { selectChatBacklog, insertChatMessage } from './chat-messages';
export { getReplyParent } from './chat-messages';

/** Reconnect catch-up for the HTTP poll path: everything newer than sinceId. */
export async function listChatMessagesSince(env: Env, sinceId: number, scope: string): Promise<ChatMessage[]> {
  const res = await env.DB.prepare("SELECT * FROM chat_messages WHERE id > ? AND scope = ? AND deleted_at IS NULL ORDER BY id ASC").bind(sinceId, scope).all<ChatMessage>();
  return res.results ?? [];
}

/** Heartbeat chat badge: messages newer than the chat_last_view cookie. */
export function countChatMessagesSince(env: Env, since: string): Promise<{ count: number } | null> {
  return env.DB.prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE created_at > ?')
    .bind(since)
    .first<{ count: number }>();
}

export async function getChatMessages(env: Env, limit: number = 50, scope: string = 'room:chat'): Promise<ChatMessage[]> {
  // Backlog read lives in the shared chat_messages module so the column list and
  // scope/deleted_at semantics stay in one place (the DO poll path uses the same).
  return selectChatBacklog(env, scope, 0, limit) as unknown as Promise<ChatMessage[]>;
}

export async function createChatMessage(env: Env, author_name: string, content: string, ip: string | null, scope: string = 'room:chat', authorId: number | null = null, replyToId: number | null = null, replyToAuthor: string | null = null, replyToExcerpt: string | null = null): Promise<void> {
  await insertChatMessage(env, {
    author_name,
    content,
    ip,
    scope,
    author_id: authorId,
    reply_to_id: replyToId,
    reply_to_author: replyToAuthor,
    reply_to_excerpt: replyToExcerpt,
  });
}

export async function deleteChatMessage(env: Env, id: number): Promise<void> {
  // Soft delete - row is retained for audit, filtered out of reads via deleted_at.
  // NOTE: unscoped by design (legacy poll-fallback contract; tests/chat-scope.test.ts
  // locks binds [id]). The scope-guarded variant lives in db/chat-messages for the DO.
  await env.DB.prepare(`UPDATE chat_messages SET deleted_at = datetime('now') WHERE id = ?`).bind(id).run();
}

export async function getLastChatMessageTime(env: Env, author_name: string, ip: string | null, scope: string = 'room:chat'): Promise<number> {
  // Parens around the OR are load-bearing: AND binds tighter than OR, so without
  // them `scope` would only filter the ip branch, not the author_name branch.
  const row = await env.DB.prepare(
    `SELECT created_at FROM chat_messages WHERE (author_name = ? OR (ip = ? AND ip IS NOT NULL)) AND scope = ? ORDER BY id DESC LIMIT 1`
  ).bind(author_name, ip, scope).first<{ created_at: string }>();
  if (!row) return 0;
  return new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
}

export async function upsertPresence(env: Env, name: string, now: number, roomId: number | null = null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO chat_presence (name, last_seen, room_id) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET last_seen = excluded.last_seen, room_id = excluded.room_id`
  ).bind(name, now, roomId).run();
  // chat_presence has no expiry otherwise - stale rows (old guests) accumulate
  // forever. Sample the cleanup so the extra write fires on ~1 call in 20, not
  // on every heartbeat.
  if (Math.random() < 0.05) {
    await env.DB.prepare('DELETE FROM chat_presence WHERE last_seen < ?')
      .bind(now - 86_400_000).run();
  }
}

/**
 * Cheap single-name presence check for the DM-header online dot. chat_presence
 * is keyed by `name`, so this is a primary-key lookup. Default window matches
 * getActivePresence (~2.5x the 60s heartbeat - survives one missed ping).
 */
export async function isUserActive(env: Env, name: string, windowMs = 150000): Promise<boolean> {
  if (!name) return false;
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM chat_presence WHERE name = ? AND last_seen > ? LIMIT 1'
  ).bind(name, Date.now() - windowMs).first<{ x: number }>();
  return row !== null;
}

export async function getActivePresence(env: Env, windowMs = 150000, roomId: number | null = null): Promise<string[]> {
  const cutoff = Date.now() - windowMs;
  const sql = roomId !== null
    ? 'SELECT name FROM chat_presence WHERE last_seen > ? AND room_id = ? ORDER BY last_seen DESC LIMIT 50'
    : 'SELECT name FROM chat_presence WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 50';
  const stmt = roomId !== null ? env.DB.prepare(sql).bind(cutoff, roomId) : env.DB.prepare(sql).bind(cutoff);
  const res = await stmt.all<{ name: string }>();
  return (res.results ?? []).map(r => r.name);
}

export async function getRoomPresenceStats(env: Env, windowMs = 60000): Promise<{room_id: number | null, count: number}[]> {
  const cutoff = Date.now() - windowMs;
  const res = await env.DB.prepare(
    'SELECT room_id, COUNT(*) as count FROM chat_presence WHERE last_seen > ? GROUP BY room_id'
  ).bind(cutoff).all<{room_id: number | null, count: number}>();
  return res.results ?? [];
}

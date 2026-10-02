// Single source of truth for chat_messages persistence.
//
// Before this module the chat_messages column list + queries were hand-rolled in
// two places (the ChatRoom Durable Object and db.ts), so adding a column meant two
// edits and one was easy to forget. Both call sites now route through here; the
// column list lives in CHAT_MSG_COLS alone.
import type { Env } from '../types';

// The wire/read shape for a chat message row. Kept in sync with CHAT_MSG_COLS.
export const CHAT_MSG_COLS =
  'id, author_name, content, created_at, author_id, reply_to_id, reply_to_author, reply_to_excerpt';

export interface ChatRow {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
  author_id: number | null;
  reply_to_id: number | null;
  reply_to_author: string | null;
  reply_to_excerpt: string | null;
}

// Backlog read, newest-N-then-chronological. sinceId > 0 fetches only newer rows
// (reconnect catch-up); sinceId <= 0 fetches the latest window. Always excludes
// soft-deleted rows and filters by scope.
export async function selectChatBacklog(
  env: Env,
  scope: string,
  sinceId: number,
  limit: number,
): Promise<ChatRow[]> {
  const base = `SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE scope = ? AND deleted_at IS NULL`;
  const res =
    sinceId > 0
      ? await env.DB.prepare(`${base} AND id > ? ORDER BY id DESC LIMIT ?`)
          .bind(scope, sinceId, limit)
          .all<ChatRow>()
      : await env.DB.prepare(`${base} ORDER BY id DESC LIMIT ?`)
          .bind(scope, limit)
          .all<ChatRow>();
  return (res.results ?? []).reverse();
}

// Insert one message and return the stored row (re-selected so created_at and id
// are populated). Returns null only if the re-select misses (should not happen).
export async function insertChatMessage(
  env: Env,
  m: {
    author_name: string;
    content: string;
    ip: string | null;
    scope: string;
    author_id: number | null;
    reply_to_id: number | null;
    reply_to_author: string | null;
    reply_to_excerpt: string | null;
  },
): Promise<ChatRow | null> {
  const ins = await env.DB.prepare(
    `INSERT INTO chat_messages (author_name, content, ip, scope, author_id, reply_to_id, reply_to_author, reply_to_excerpt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      m.author_name,
      m.content,
      m.ip,
      m.scope,
      m.author_id,
      m.reply_to_id,
      m.reply_to_author,
      m.reply_to_excerpt,
    )
    .run();
  return env.DB.prepare(`SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE id = ?`)
    .bind(ins.meta.last_row_id)
    .first<ChatRow>();
}

// Scope-guarded soft delete (a mod in room A cannot delete room B's message via a
// crafted id). Returns rows changed (0 if id/scope miss or already deleted).
export async function softDeleteChatMessage(
  env: Env,
  id: number,
  scope: string,
): Promise<number> {
  const del = await env.DB.prepare(
    `UPDATE chat_messages SET deleted_at = datetime('now') WHERE id = ? AND scope = ? AND deleted_at IS NULL`,
  )
    .bind(id, scope)
    .run();
  return del.meta.changes ?? 0;
}

// Resolve a reply parent within the same scope, for denormalizing author/excerpt.
export async function getReplyParent(
  env: Env,
  id: number,
  scope: string,
): Promise<{ author_name: string; content: string } | null> {
  return env.DB.prepare(
    `SELECT author_name, content FROM chat_messages WHERE id = ? AND scope = ? AND deleted_at IS NULL`,
  )
    .bind(id, scope)
    .first<{ author_name: string; content: string }>();
}

// The scope a message lives in (used to reject cross-scope reaction attempts).
export async function getChatMessageScope(env: Env, id: number): Promise<string | null> {
  const r = await env.DB.prepare(
    `SELECT scope FROM chat_messages WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(id)
    .first<{ scope: string }>();
  return r?.scope ?? null;
}

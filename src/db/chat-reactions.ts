// Chat-message reactions (chat_messages.id namespace, distinct from
// post_reactions). Self-contained domain extracted from db.ts behind the db.ts
// re-export barrel (zero caller changes).
import type { Env } from '../types';

/**
 * Toggle a single (message_id, user_id, emoji) reaction on a ROOM chat message.
 * Mirrors toggleReaction's existence-check pattern. Returns 'added' on INSERT,
 * 'removed' on DELETE. The emoji whitelist is enforced by the caller (the DO);
 * this helper trusts its inputs.
 */
export async function toggleChatReaction(
  env: Env,
  messageId: number,
  userId: number,
  emoji: string,
): Promise<'added' | 'removed'> {
  const existing = await env.DB.prepare(
    'SELECT id FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
  ).bind(messageId, userId, emoji).first();
  if (existing) {
    await env.DB.prepare(
      'DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    ).bind(messageId, userId, emoji).run();
    return 'removed';
  }
  await env.DB.prepare(
    'INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
  ).bind(messageId, userId, emoji).run();
  return 'added';
}

/** Authoritative count for one (message, emoji) - fanned out after a toggle. */
export async function countChatReaction(env: Env, messageId: number, emoji: string): Promise<number> {
  const cnt = await env.DB.prepare(
    'SELECT COUNT(*) as c FROM chat_reactions WHERE message_id = ? AND emoji = ?',
  ).bind(messageId, emoji).first<{ c: number }>();
  return cnt?.c ?? 0;
}

/**
 * Grouped reaction counts for a batch of chat messages. One query
 * (WHERE message_id IN (...)) with bound params (never id interpolation).
 * Returns a map message_id -> [{emoji, count, userIds}]; messages with no
 * reactions have no map entry. userIds are the reactors (used client-side to
 * seed the viewer's own toggled set). Empty input -> empty map.
 */
export async function getChatReactionCounts(
  env: Env,
  messageIds: number[],
): Promise<Map<number, { emoji: string; count: number; userIds: number[] }[]>> {
  const map = new Map<number, { emoji: string; count: number; userIds: number[] }[]>();
  if (messageIds.length === 0) return map;
  const placeholders = messageIds.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT message_id, emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
       FROM chat_reactions
       WHERE message_id IN (${placeholders})
       GROUP BY message_id, emoji`,
  ).bind(...messageIds).all<{ message_id: number; emoji: string; count: number; user_ids: string | null }>();
  for (const row of res.results ?? []) {
    const userIds = (row.user_ids ?? '')
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    const list = map.get(row.message_id) ?? [];
    list.push({ emoji: row.emoji, count: row.count, userIds });
    map.set(row.message_id, list);
  }
  return map;
}

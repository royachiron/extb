// Post/topic reactions (post_reactions table). Self-contained domain extracted
// from db.ts behind the db.ts re-export barrel (zero caller changes).
import type { Env } from '../types';

export async function toggleReaction(env: Env, targetId: number, userId: number, emoji: string, isTopic = false): Promise<void> {
  const col = isTopic ? 'topic_id' : 'post_id';
  const existing = await env.DB.prepare(
    `SELECT id FROM post_reactions WHERE ${col} = ? AND user_id = ? AND emoji = ?`
  ).bind(targetId, userId, emoji).first();

  if (existing) {
    await env.DB.prepare(
      `DELETE FROM post_reactions WHERE ${col} = ? AND user_id = ? AND emoji = ?`
    ).bind(targetId, userId, emoji).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO post_reactions (${col}, user_id, emoji) VALUES (?, ?, ?)`
    ).bind(targetId, userId, emoji).run();
  }
}

export async function getReactionsForPost(env: Env, targetId: number, isTopic = false): Promise<any[]> {
  const col = isTopic ? 'topic_id' : 'post_id';
  const res = await env.DB.prepare(
    `SELECT emoji, COUNT(*) as count,
     GROUP_CONCAT(u.display_name) as users
     FROM post_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.${col} = ?
     GROUP BY emoji`
  ).bind(targetId).all();
  return res.results ?? [];
}

/**
 * Buckets flat reaction rows (each carrying a post_id) into a map keyed by
 * post_id. Pure - no D1 - so it is unit-testable. The post_id is dropped from
 * each stored entry so the shape matches what getReactionsForPost returned.
 */
export function groupReactionsByPost(
  rows: { post_id: number; emoji: string; count: number; users: string | null }[],
): Map<number, { emoji: string; count: number; users: string | null }[]> {
  const map = new Map<number, { emoji: string; count: number; users: string | null }[]>();
  for (const row of rows) {
    const list = map.get(row.post_id) ?? [];
    list.push({ emoji: row.emoji, count: row.count, users: row.users });
    map.set(row.post_id, list);
  }
  return map;
}

/**
 * Batched replacement for calling getReactionsForPost once per post.
 * Runs one query (WHERE post_id IN (...)) instead of N. Returns a map
 * post_id -> reactions; a post with no reactions has no map entry.
 */
export async function getReactionsForPosts(
  env: Env,
  postIds: number[],
): Promise<Map<number, { emoji: string; count: number; users: string | null }[]>> {
  if (postIds.length === 0) return new Map();
  const placeholders = postIds.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT r.post_id, r.emoji, COUNT(*) as count,
       GROUP_CONCAT(u.display_name) as users
     FROM post_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.post_id IN (${placeholders})
     GROUP BY r.post_id, r.emoji`
  ).bind(...postIds).all<{ post_id: number; emoji: string; count: number; users: string | null }>();
  return groupReactionsByPost(res.results ?? []);
}

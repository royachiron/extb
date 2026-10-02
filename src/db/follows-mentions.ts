// Topic follows and @mention user lookup. Self-contained domain extracted from
// db.ts behind the db.ts re-export barrel (zero caller changes).
import type { User, Env } from '../types';

export async function createTopicFollow(env: Env, topicId: number, userId: number): Promise<void> {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO topic_follows (topic_id, user_id) VALUES (?, ?)'
  ).bind(topicId, userId).run();
}

export async function deleteTopicFollow(env: Env, topicId: number, userId: number): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM topic_follows WHERE topic_id = ? AND user_id = ?'
  ).bind(topicId, userId).run();
}

export async function isFollowingTopic(env: Env, topicId: number, userId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM topic_follows WHERE topic_id = ? AND user_id = ?'
  ).bind(topicId, userId).first();
  return !!row;
}

export async function listTopicFollowers(env: Env, topicId: number): Promise<number[]> {
  const res = await env.DB.prepare(
    'SELECT user_id FROM topic_follows WHERE topic_id = ?'
  ).bind(topicId).all<{ user_id: number }>();
  return (res.results ?? []).map(r => r.user_id);
}

export async function getUsersByDisplayNames(env: Env, names: string[]): Promise<User[]> {
  if (names.length === 0) return [];
  const placeholders = names.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT * FROM users WHERE display_name IN (${placeholders}) AND is_banned = 0`
  ).bind(...names).all<User>();
  return res.results ?? [];
}

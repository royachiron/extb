import type { Env } from '../types';

export async function blockUser(env: Env, blockerId: number, blockedId: number): Promise<void> {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)'
  ).bind(blockerId, blockedId).run();
}

export async function unblockUser(env: Env, blockerId: number, blockedId: number): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).bind(blockerId, blockedId).run();
}

export async function isBlocked(env: Env, blockerId: number, blockedId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).bind(blockerId, blockedId).first();
  return !!row;
}

export async function getBlockedIds(env: Env, blockerId: number): Promise<number[]> {
  const res = await env.DB.prepare(
    'SELECT blocked_id FROM user_blocks WHERE blocker_id = ?'
  ).bind(blockerId).all<{ blocked_id: number }>();
  return (res.results ?? []).map(r => r.blocked_id);
}

import type { Env, UserCapability } from '../types';

export async function hasCapability(
  env: Env,
  userId: number,
  capability: UserCapability,
): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM user_capabilities WHERE user_id = ? AND capability = ? LIMIT 1'
  ).bind(userId, capability).first<{ x: number }>();
  return !!row;
}

export async function grantCapability(
  env: Env,
  userId: number,
  capability: UserCapability,
  grantedBy: number,
  note: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_capabilities (user_id, capability, granted_by, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, capability) DO UPDATE SET
       granted_by = excluded.granted_by,
       note = excluded.note`
  ).bind(userId, capability, grantedBy, note).run();
}

export async function revokeCapability(
  env: Env,
  userId: number,
  capability: UserCapability,
): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM user_capabilities WHERE user_id = ? AND capability = ?'
  ).bind(userId, capability).run();
}

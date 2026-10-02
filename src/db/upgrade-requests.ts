// Upgrade request persistence (club/full membership requests + intake decisions).
// Self-contained domain extracted from db.ts behind the db.ts re-export barrel
// (zero caller changes).
import type { Env, UpgradeRequest, UpgradeStatus } from '../types';

export async function listPendingUpgradeRequests(env: Env): Promise<UpgradeRequest[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM upgrade_requests WHERE status = 'pending' ORDER BY created_at ASC"
  ).all<UpgradeRequest>();
  return res.results ?? [];
}

export interface OpenUpgradeRow extends UpgradeRequest {
  display_name: string | null;
}

export async function listOpenUpgradeRequestsWithUser(env: Env): Promise<OpenUpgradeRow[]> {
  const res = await env.DB.prepare(
    `SELECT u.*, usr.display_name FROM upgrade_requests u
       JOIN users usr ON usr.id = u.user_id
       WHERE u.status = 'pending'
       ORDER BY u.created_at ASC`
  ).all<OpenUpgradeRow>();
  return res.results ?? [];
}

export async function getUpgradeRequestById(
  env: Env,
  id: number
): Promise<UpgradeRequest | null> {
  const row = await env.DB.prepare('SELECT * FROM upgrade_requests WHERE id = ?')
    .bind(id)
    .first<UpgradeRequest>();
  return row ?? null;
}

export async function createUpgradeRequest(
  env: Env,
  userId: number,
  note: string | null
): Promise<UpgradeRequest> {
  const row = await env.DB.prepare(
    'INSERT INTO upgrade_requests (user_id, note) VALUES (?, ?) RETURNING *'
  )
    .bind(userId, note)
    .first<UpgradeRequest>();
  if (!row) throw new Error('createUpgradeRequest failed');
  return row;
}

export async function resolveUpgradeRequest(
  env: Env,
  id: number,
  status: UpgradeStatus,
  handledBy: number,
  modReason: string | null = null
): Promise<void> {
  await env.DB.prepare(
    `UPDATE upgrade_requests SET status = ?, handled_by = ?, mod_reason = ?, resolved_at = datetime('now')
       WHERE id = ?`
  )
    .bind(status, handledBy, modReason, id)
    .run();
}

/**
 * Records an intake decision (approve/decline) as a resolved row in
 * upgrade_requests. The table is now a pure audit log for the Intake Logs
 * view - the live queue is sourced from listUnreviewedMembers (member-rank
 * users + their intro post), not from this table.
 */
export async function recordIntakeDecision(
  env: Env,
  userId: number,
  status: 'approved' | 'declined',
  handledBy: number,
  modReason: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO upgrade_requests (user_id, note, status, handled_by, mod_reason, resolved_at)
     VALUES (?, NULL, ?, ?, ?, datetime('now'))`
  )
    .bind(userId, status, handledBy, modReason)
    .run();
}

export interface ResolvedUpgradeRow extends UpgradeRequest {
  user_display_name: string | null;
  mod_display_name: string | null;
}

export async function listResolvedUpgradeRequests(env: Env, limit: number = 100): Promise<ResolvedUpgradeRow[]> {
  const res = await env.DB.prepare(
    `SELECT u.*, usr.display_name AS user_display_name, m.display_name AS mod_display_name
       FROM upgrade_requests u
       JOIN users usr ON usr.id = u.user_id
       LEFT JOIN users m ON m.id = u.handled_by
       WHERE u.status != 'pending'
       ORDER BY u.resolved_at DESC LIMIT ?`
  ).bind(limit).all<ResolvedUpgradeRow>();
  return res.results ?? [];
}

export async function getPendingUpgradeRequest(
  env: Env,
  userId: number
): Promise<UpgradeRequest | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM upgrade_requests WHERE user_id = ? AND status = 'pending'"
  )
    .bind(userId)
    .first<UpgradeRequest>();
  return row ?? null;
}

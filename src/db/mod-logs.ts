// Mod log and ban appeal persistence. Self-contained domain extracted from
// db.ts behind the db.ts re-export barrel (zero caller changes).
import type { Env, ModLog, BanAppeal } from '../types';

// ActivityEvent and ActivityCategory are local to this module (not in types.ts),
// so they are defined and exported here.
export interface ActivityEvent {
  source: 'mod' | 'audit';
  id: number;
  actor_id: number;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  target_user_name: string | null;
  target_intro_short_id: string | null;
  topic_short_id: string | null;
  details: string | null;
  created_at: string;
}

export type ActivityCategory = 'members' | 'moderation' | 'admin';

export async function createModLog(
  env: Env,
  modId: number,
  action: string,
  targetType: string,
  targetId: number | null,
  details: string | null
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO mod_logs (mod_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(modId, action, targetType, targetId, details)
    .run();
}

export async function listModLogs(env: Env, limit: number = 100): Promise<ModLog[]> {
  const res = await env.DB.prepare(
    `SELECT l.*, u.display_name AS mod_display_name FROM mod_logs l
       JOIN users u ON u.id = l.mod_id
       ORDER BY l.created_at DESC LIMIT ?`
  ).bind(limit).all<ModLog>();
  return res.results ?? [];
}

export async function listActivityFeed(env: Env, limit = 150): Promise<ActivityEvent[]> {
  const modRes = await env.DB.prepare(
    `SELECT l.id, l.mod_id AS actor_id, a.display_name AS actor_name,
            l.action, l.target_type, l.target_id, l.details, l.created_at,
            tu.display_name AS target_user_name,
            intro.short_id  AS target_intro_short_id,
            tt.short_id     AS topic_short_id
     FROM mod_logs l
     JOIN users a ON a.id = l.mod_id
     LEFT JOIN users tu ON l.target_type = 'user' AND tu.id = l.target_id
     LEFT JOIN topics intro ON l.target_type = 'user'
           AND intro.user_id = l.target_id
           AND intro.room_id = (SELECT id FROM rooms WHERE slug = 'introductions')
           AND intro.removed_at IS NULL
     LEFT JOIN topics tt ON l.target_type = 'topic' AND tt.id = l.target_id
     ORDER BY l.created_at DESC
     LIMIT ?`
  ).bind(limit).all<any>();

  const modEvents: ActivityEvent[] = (modRes.results ?? []).map((r) => ({
    source: 'mod' as const,
    id: r.id,
    actor_id: r.actor_id,
    actor_name: r.actor_name ?? null,
    action: r.action,
    target_type: r.target_type ?? null,
    target_id: r.target_id ?? null,
    target_user_name: r.target_user_name ?? null,
    target_intro_short_id: r.target_intro_short_id ?? null,
    topic_short_id: r.topic_short_id ?? null,
    details: r.details ?? null,
    created_at: r.created_at,
  }));

  const auditRes = await env.DB.prepare(
    `SELECT al.id, al.user_id AS actor_id, a.display_name AS actor_name,
            al.action, al.details, al.created_at
     FROM audit_logs al
     JOIN users a ON a.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT ?`
  ).bind(limit).all<any>();

  const auditRows = auditRes.results ?? [];
  const targetIds = new Set<number>();
  for (const r of auditRows) {
    const m = /user=(\d+)/.exec(r.details ?? '');
    if (m?.[1]) targetIds.add(Number(m[1]));
  }

  const nameById = new Map<number, string>();
  const introById = new Map<number, string>();
  if (targetIds.size > 0) {
    const ids = [...targetIds];
    const placeholders = ids.map(() => '?').join(',');
    const names = await env.DB.prepare(
      `SELECT id, display_name FROM users WHERE id IN (${placeholders})`
    ).bind(...ids).all<{ id: number; display_name: string | null }>();
    for (const u of names.results ?? []) if (u.display_name) nameById.set(u.id, u.display_name);

    const intros = await env.DB.prepare(
      `SELECT user_id, short_id FROM topics
       WHERE user_id IN (${placeholders}) AND removed_at IS NULL
         AND room_id = (SELECT id FROM rooms WHERE slug = 'introductions')`
    ).bind(...ids).all<{ user_id: number; short_id: string }>();
    for (const t of intros.results ?? []) if (!introById.has(t.user_id)) introById.set(t.user_id, t.short_id);
  }

  const auditEvents: ActivityEvent[] = auditRows.map((r) => {
    const m = /user=(\d+)/.exec(r.details ?? '');
    const targetId = m?.[1] ? Number(m[1]) : null;
    return {
      source: 'audit' as const,
      id: r.id,
      actor_id: r.actor_id,
      actor_name: r.actor_name ?? null,
      action: r.action,
      target_type: targetId ? 'user' : null,
      target_id: targetId,
      target_user_name: targetId ? (nameById.get(targetId) ?? null) : null,
      target_intro_short_id: targetId ? (introById.get(targetId) ?? null) : null,
      topic_short_id: null,
      details: r.details ?? null,
      created_at: r.created_at,
    };
  });

  return [...modEvents, ...auditEvents]
    .sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0))
    .slice(0, limit);
}

export async function createBanAppeal(
  env: Env,
  userId: number,
  reason: string
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO ban_appeals (user_id, reason) VALUES (?, ?)'
  )
    .bind(userId, reason)
    .run();
}

export async function listOpenBanAppeals(env: Env): Promise<BanAppeal[]> {
  const res = await env.DB.prepare(
    `SELECT a.*, u.display_name AS user_display_name FROM ban_appeals a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`
  ).all<BanAppeal>();
  return res.results ?? [];
}

export async function getBanAppealById(env: Env, id: number): Promise<BanAppeal | null> {
  const row = await env.DB.prepare('SELECT * FROM ban_appeals WHERE id = ?').bind(id).first<BanAppeal>();
  return row ?? null;
}

export async function resolveBanAppeal(
  env: Env,
  id: number,
  status: 'approved' | 'rejected',
  modId: number,
  modNote: string | null
): Promise<void> {
  await env.DB.prepare(
    `UPDATE ban_appeals SET status = ?, mod_id = ?, mod_note = ?, resolved_at = datetime('now')
       WHERE id = ?`
  )
    .bind(status, modId, modNote, id)
    .run();
}

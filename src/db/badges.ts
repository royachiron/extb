// Badge persistence: badges, user_badges. Self-contained domain extracted from
// db.ts behind the db.ts re-export barrel (zero caller changes).
import type { Badge, Env } from '../types';

export async function createBadge(env: Env, name: string, icon: string, color: string, textColor: string, shape: string, desc: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO badges (name, icon, color, text_color, shape, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(name, icon, color, textColor, shape, desc).run();
}

export async function updateBadge(env: Env, id: number, name: string, icon: string, color: string, textColor: string, desc: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE badges SET name = ?, icon = ?, color = ?, text_color = ?, description = ? WHERE id = ?'
  ).bind(name, icon, color, textColor, desc, id).run();
}

export async function deleteBadge(env: Env, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM user_badges WHERE badge_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM badges WHERE id = ?').bind(id).run();
}

export async function listAllBadges(env: Env): Promise<any[]> {
  const res = await env.DB.prepare('SELECT * FROM badges ORDER BY name ASC').all();
  return res.results ?? [];
}

export async function assignBadge(env: Env, userId: number, badgeId: number, status: 'have' | 'need' = 'have'): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO user_badges (user_id, badge_id, status) VALUES (?, ?, ?)')
    .bind(userId, badgeId, status).run();
}

export async function assignBadgesBatch(env: Env, userId: number, assignments: {id: number, status: 'have' | 'need'}[]): Promise<void> {
  if (assignments.length === 0) return;
  const placeholders = assignments.map(() => '(?, ?, ?)').join(', ');
  const params = assignments.flatMap(a => [userId, a.id, a.status]);
  await env.DB.prepare(`INSERT OR REPLACE INTO user_badges (user_id, badge_id, status) VALUES ${placeholders}`)
    .bind(...params).run();
}

export async function listBadgesForUser(env: Env, userId: number): Promise<Badge[]> {
  const res = await env.DB.prepare(`SELECT b.*, ub.status FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? ORDER BY b.name ASC`).bind(userId).all<Badge>();
  return res.results ?? [];
}

export async function searchBadges(env: Env, query: string, limit = 12): Promise<any[]> {
  const q = query.trim();
  if (!q) {
    const res = await env.DB.prepare(`SELECT * FROM badges WHERE 1=1  ORDER BY name ASC LIMIT ?`).bind(limit).all();
    return res.results ?? [];
  }
  const like = `%${q.replace(/[%_]/g, m => '\\' + m)}%`;
  const res = await env.DB.prepare(
    `SELECT * FROM badges
     WHERE (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
     
     ORDER BY
       CASE WHEN name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
       name ASC
     LIMIT ?`
  ).bind(like, like, `${q}%`, limit).all();
  return res.results ?? [];
}

export async function removeUserBadge(env: Env, userId: number, badgeId: number): Promise<void> {
  await env.DB.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?')
    .bind(userId, badgeId).run();
}

export async function getBadgeById(env: Env, badgeId: number): Promise<any | null> {
  const row = await env.DB.prepare('SELECT * FROM badges WHERE id = ?').bind(badgeId).first();
  return row ?? null;
}

import type { Env } from '../types';

export async function logAdminAction(
  env: Env,
  userId: number,
  action: string,
  details: string | null = null
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)'
  )
    .bind(userId, action, details)
    .run();
}

export async function getAuditLogs(env: Env, limit: number = 100, action?: string): Promise<any[]> {
  const where = action ? 'WHERE l.action = ?' : '';
  const query = `
    SELECT l.*, u.display_name as user_name,
           CASE
             WHEN l.details LIKE 'user=%' THEN SUBSTR(l.details, 6, INSTR(l.details || ' ', ' ') - 6)
             ELSE NULL
           END as target_id,
           t.display_name as target_name
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN users t ON t.id = CAST(CASE
             WHEN l.details LIKE 'user=%' THEN SUBSTR(l.details, 6, INSTR(l.details || ' ', ' ') - 6)
             ELSE NULL
           END AS INTEGER)
    ${where}
    ORDER BY l.created_at DESC LIMIT ?`;

  const stmt = action ? env.DB.prepare(query).bind(action, limit) : env.DB.prepare(query).bind(limit);
  const res = await stmt.all();
  return res.results ?? [];
}

export async function getSiteStats(env: Env): Promise<any> {
  const [users, topics, dms, forumViews] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first('count'),
    env.DB.prepare("SELECT COUNT(*) as count FROM topics WHERE created_at > datetime('now', '-1 day')").first('count'),
    env.DB.prepare('SELECT COUNT(*) as count FROM rooms WHERE kind = "dm"').first('count'),
    getForumViewStats(env),
  ]);
  return { users, topics, dms, forumViews };
}

export async function logForumView(env: Env, userId: number | null): Promise<void> {
  await env.DB.prepare('INSERT INTO forum_view_events (user_id) VALUES (?)').bind(userId).run();
}

export interface ForumViewStats {
  views_24h: number;
  users_24h: number;
  views_7d: number;
  users_7d: number;
  views_30d: number;
  users_30d: number;
}

export async function getForumViewStats(env: Env): Promise<ForumViewStats> {
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > datetime('now', '-1 day')) as views_24h,
      COUNT(DISTINCT user_id) FILTER (WHERE created_at > datetime('now', '-1 day')) as users_24h,
      COUNT(*) FILTER (WHERE created_at > datetime('now', '-7 days')) as views_7d,
      COUNT(DISTINCT user_id) FILTER (WHERE created_at > datetime('now', '-7 days')) as users_7d,
      COUNT(*) FILTER (WHERE created_at > datetime('now', '-30 days')) as views_30d,
      COUNT(DISTINCT user_id) FILTER (WHERE created_at > datetime('now', '-30 days')) as users_30d
    FROM forum_view_events
  `).first<ForumViewStats>();
  return row ?? { views_24h: 0, users_24h: 0, views_7d: 0, users_7d: 0, views_30d: 0, users_30d: 0 };
}

export async function getActivityHeatmap(env: Env): Promise<{hour: number, day: number, count: number}[]> {
  const res = await env.DB.prepare(`
    SELECT
      CAST(strftime('%H', created_at) AS INTEGER) as hour,
      CAST(strftime('%w', created_at) AS INTEGER) as day,
      COUNT(*) as count
    FROM (
      SELECT created_at FROM topics WHERE deleted_at IS NULL
      UNION ALL
      SELECT created_at FROM posts WHERE deleted_at IS NULL
    )
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY hour, day
  `).all<{hour: number, day: number, count: number}>();
  return res.results ?? [];
}


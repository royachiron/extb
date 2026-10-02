// Notification persistence. Self-contained domain extracted from db.ts behind
// the db.ts re-export barrel (zero caller changes).
import type { Env } from '../types';

export async function listNotificationsForUser(env: Env, userId: number, limit: number): Promise<any[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(userId, limit).all();
  return res.results ?? [];
}

/**
 * Id-cursor page for the /notifications full page. Does NOT mark anything
 * read. Fetches limit+1 to detect a further page.
 */
export async function listNotificationsPage(
  env: Env,
  userId: number,
  limit: number,
  beforeId: number | null,
): Promise<{ notifications: any[]; nextBeforeId: number | null }> {
  const res = beforeId
    ? await env.DB.prepare(
        `SELECT * FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
      ).bind(userId, beforeId, limit + 1).all()
    : await env.DB.prepare(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`
      ).bind(userId, limit + 1).all();
  let rows = res.results ?? [];
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  const last = rows[rows.length - 1] as { id: number } | undefined;
  return { notifications: rows, nextBeforeId: hasMore && last ? last.id : null };
}

export async function markNotificationsRead(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL"
  ).bind(userId).run();
}

export async function insertNotification(
  env: Env,
  userId: number,
  content: string,
  url: string,
  type: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO notifications (user_id, content, url, type) VALUES (?, ?, ?, ?)'
  ).bind(userId, content, url, type).run();
}

/** Typeless mod-warning notification (no `type` column value - legacy shape). */
export async function insertModWarningNotification(
  env: Env,
  userId: number,
  content: string,
  url: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, content, url) VALUES (?, ?, ?)`
  ).bind(userId, content, url).run();
}

/** Notification for a mod reply on a warning thread - type fixed in SQL. */
export async function insertWarningReplyNotification(
  env: Env,
  userId: number,
  content: string,
  url: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, content, url, type) VALUES (?, ?, ?, 'warning')`
  ).bind(userId, content, url).run();
}

/** One D1 batch insert for many recipients of the same post. */
export async function insertNotificationsBatch(
  env: Env,
  rows: { userId: number; content: string; url: string; type: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const stmt = env.DB.prepare(
    'INSERT INTO notifications (user_id, content, url, type) VALUES (?, ?, ?, ?)'
  );
  await env.DB.batch(rows.map((r) => stmt.bind(r.userId, r.content, r.url, r.type)));
}

export async function countUnseenNotifications(env: Env, userId: number): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL'
  ).bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
}

// Warning (disciplinary) persistence: warnings, warning_replies. Self-contained
// domain extracted from db.ts behind the db.ts re-export barrel (zero caller changes).
import type { Env, Warning, WarningReply, WarningReplyWithAuthor, WarningWithReplies, ModWarningThread } from '../types';

export async function createWarning(
  env: Env,
  userId: number,
  modId: number | null,
  targetType: string,
  targetId: number,
  targetContent: string,
  internalMemo: string
): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO warnings (user_id, mod_id, target_type, target_id, target_content, internal_memo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(userId, modId, targetType, targetId, targetContent, internalMemo)
    .first<{ id: number }>();
  if (!row) throw new Error('createWarning failed');
  return row.id;
}

export async function getWarningById(env: Env, id: number): Promise<Warning | null> {
  const row = await env.DB.prepare('SELECT * FROM warnings WHERE id = ?').bind(id).first<Warning>();
  return row ?? null;
}

export async function listWarningsForUser(env: Env, userId: number): Promise<Warning[]> {
  const res = await env.DB.prepare(
    'SELECT * FROM warnings WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<Warning>();
  return res.results ?? [];
}

export async function listWarningsWithReplies(env: Env, userId: number): Promise<WarningWithReplies[]> {
  const rawWarnings = await env.DB.prepare(
    `SELECT w.*, u.display_name AS mod_display_name
     FROM warnings w
     LEFT JOIN users u ON u.id = w.mod_id
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC`
  ).bind(userId).all<Warning & { mod_display_name: string | null }>();

  const warnings = rawWarnings.results ?? [];
  if (warnings.length === 0) return [];

  const warningIds = warnings.map(w => w.id);
  const placeholders = warningIds.map(() => '?').join(',');

  const replies = await env.DB.prepare(
    `SELECT * FROM warning_replies WHERE warning_id IN (${placeholders}) ORDER BY created_at ASC`
  )
    .bind(...warningIds)
    .all<WarningReply>();

  const repliesByWarningId = new Map<number, WarningReply[]>();
  (replies.results ?? []).forEach(reply => {
    if (!repliesByWarningId.has(reply.warning_id)) {
      repliesByWarningId.set(reply.warning_id, []);
    }
    repliesByWarningId.get(reply.warning_id)!.push(reply);
  });

  return warnings.map(warning => ({
    ...warning,
    replies: repliesByWarningId.get(warning.id) ?? []
  }));
}

export async function addWarningReply(
  env: Env,
  warningId: number,
  userId: number,
  content: string,
  hideAuthor: 0 | 1 = 0
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO warning_replies (warning_id, user_id, content, hide_author) VALUES (?, ?, ?, ?)'
  )
    .bind(warningId, userId, content, hideAuthor)
    .run();
}

export async function resolveWarning(
  env: Env,
  id: number,
  modId: number,
  resolveMemo: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE warnings SET resolved_at = datetime('now'), resolved_by = ?, resolve_memo = ? WHERE id = ?`
  )
    .bind(modId, resolveMemo, id)
    .run();
}

export async function listAllWarningsWithReplies(env: Env): Promise<ModWarningThread[]> {
  const rawWarnings = await env.DB.prepare(
    `SELECT w.*, wu.display_name AS user_display_name, mu.display_name AS mod_display_name
     FROM warnings w
     LEFT JOIN users wu ON wu.id = w.user_id
     LEFT JOIN users mu ON mu.id = w.mod_id
     ORDER BY w.created_at DESC`
  ).all<Warning & { user_display_name: string | null; mod_display_name: string | null }>();

  const warnings = rawWarnings.results ?? [];
  if (warnings.length === 0) return [];

  const warningIds = warnings.map(w => w.id);
  const placeholders = warningIds.map(() => '?').join(',');

  const replies = await env.DB.prepare(
    `SELECT r.*, u.display_name AS author_display_name
     FROM warning_replies r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.warning_id IN (${placeholders})
     ORDER BY r.created_at ASC`
  ).bind(...warningIds).all<WarningReplyWithAuthor>();

  const repliesByWarningId = new Map<number, WarningReplyWithAuthor[]>();
  (replies.results ?? []).forEach(reply => {
    if (!repliesByWarningId.has(reply.warning_id)) {
      repliesByWarningId.set(reply.warning_id, []);
    }
    repliesByWarningId.get(reply.warning_id)!.push(reply);
  });

  return warnings.map(warning => ({
    ...warning,
    replies: repliesByWarningId.get(warning.id) ?? []
  }));
}

export async function countWarnings(env: Env): Promise<{ total: number; unresolved: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved
     FROM warnings`
  ).first<{ total: number; unresolved: number }>();
  return { total: row?.total ?? 0, unresolved: row?.unresolved ?? 0 };
}

export async function hasUnresolvedWarning(env: Env, userId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM warnings WHERE user_id = ? AND resolved_at IS NULL LIMIT 1'
  ).bind(userId).first<{ x: number }>();
  return !!row;
}

// True if user has posted a topic or a reply within the last hour.
export async function hasRecentUserContent(env: Env, userId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT (
       EXISTS(SELECT 1 FROM posts  WHERE user_id = ? AND created_at > datetime('now','-1 hour'))
       OR
       EXISTS(SELECT 1 FROM topics WHERE user_id = ? AND created_at > datetime('now','-1 hour'))
     ) AS recent`
  ).bind(userId, userId).first<{ recent: number }>();
  return !!row?.recent;
}

import type { Env } from '../types';

export const REPORT_REASONS = ['harassment', 'self-harm-risk', 'spam', 'nsfw-unmarked', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGET_TYPES = ['topic', 'post', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or abuse',
  'self-harm-risk': 'Someone may be at risk of self-harm',
  spam: 'Spam',
  'nsfw-unmarked': 'NSFW without content warning',
  other: 'Something else',
};

export interface ReportRow {
  id: number;
  reporter_id: number;
  reporter_name: string | null;
  content_type: ReportTargetType;
  content_id: number;
  reason: ReportReason;
  detail: string | null;
  status: string;
  created_at: string;
  /** Post reports: excerpt of the post; topic reports: excerpt of the OP. */
  content_preview: string | null;
  topic_title: string | null;
  topic_short_id: string | null;
  /** User reports: the reported user's display name. */
  target_user_name: string | null;
}

/**
 * Insert a report; the UNIQUE(reporter_id, content_type, content_id) index
 * turns a repeat report into 'duplicate' instead of a second queue row.
 */
export async function createReport(
  env: Env,
  reporterId: number,
  targetType: ReportTargetType,
  targetId: number,
  reason: ReportReason,
  detail: string | null,
): Promise<'created' | 'duplicate'> {
  try {
    await env.DB.prepare(
      'INSERT INTO reports (reporter_id, content_type, content_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(reporterId, targetType, targetId, reason, detail).run();
    return 'created';
  } catch (e) {
    if (String(e).includes('UNIQUE')) return 'duplicate';
    throw e;
  }
}

/** Authoritative daily rate-limit input (last 24h, any status). */
export async function countReportsByUserToday(env: Env, reporterId: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM reports WHERE reporter_id = ? AND created_at > datetime('now', '-1 day')"
  ).bind(reporterId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countOpenReports(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM reports WHERE status = 'pending'"
  ).first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Open reports for the mod queue, self-harm-risk first, then oldest first.
 * Target previews resolve via LEFT JOINs (all PK lookups); a report whose
 * target has since been hard-deleted still lists, with a null preview.
 */
export async function listOpenReports(env: Env, limit = 100): Promise<ReportRow[]> {
  const result = await env.DB.prepare(
    `SELECT rep.id, rep.reporter_id, ru.display_name AS reporter_name,
            rep.content_type, rep.content_id, rep.reason, rep.detail,
            rep.status, rep.created_at,
            CASE rep.content_type
              WHEN 'post' THEN substr(p.content, 1, 200)
              WHEN 'topic' THEN substr(t.content, 1, 200)
            END AS content_preview,
            COALESCE(t.title, pt.title) AS topic_title,
            COALESCE(t.short_id, pt.short_id) AS topic_short_id,
            tu.display_name AS target_user_name
     FROM reports rep
     JOIN users ru ON ru.id = rep.reporter_id
     LEFT JOIN posts p ON rep.content_type = 'post' AND p.id = rep.content_id
     LEFT JOIN topics pt ON pt.id = p.topic_id
     LEFT JOIN topics t ON rep.content_type = 'topic' AND t.id = rep.content_id
     LEFT JOIN users tu ON rep.content_type = 'user' AND tu.id = rep.content_id
     WHERE rep.status = 'pending'
     ORDER BY CASE WHEN rep.reason = 'self-harm-risk' THEN 0 ELSE 1 END, rep.created_at ASC
     LIMIT ?`
  ).bind(limit).all<ReportRow>();
  return result.results ?? [];
}

export async function resolveReport(
  env: Env,
  id: number,
  modId: number,
  status: 'resolved' | 'dismissed',
  note: string | null,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now'), resolution_note = ? WHERE id = ? AND status = 'pending'"
  ).bind(status, modId, note, id).run();
}

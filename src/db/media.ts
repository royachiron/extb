// Upload-quota accounting for /api/upload. Columns live on users but the
// concern is media quota, so the queries live here.
import type { Env } from '../types';

export async function getMonthlyUploadUsage(
  env: Env,
  userId: number,
): Promise<{ monthly_upload_bytes: number; monthly_upload_month: string | null } | null> {
  const row = await env.DB.prepare(
    'SELECT monthly_upload_bytes, monthly_upload_month FROM users WHERE id = ?'
  ).bind(userId).first<{ monthly_upload_bytes: number; monthly_upload_month: string | null }>();
  return row ?? null;
}

/** Add bytes to this month's counter, resetting it when the month rolled over. */
export async function addMonthlyUploadBytes(
  env: Env,
  userId: number,
  currentMonth: string,
  size: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users
       SET monthly_upload_bytes = CASE WHEN monthly_upload_month = ? THEN monthly_upload_bytes + ? ELSE ? END,
           monthly_upload_month = ?
     WHERE id = ?`
  ).bind(currentMonth, size, size, currentMonth, userId).run();
}

export async function sumMonthlyUploadBytes(env: Env, currentMonth: string): Promise<number> {
  const total = await env.DB.prepare(
    'SELECT COALESCE(SUM(monthly_upload_bytes), 0) AS bytes FROM users WHERE monthly_upload_month = ?'
  ).bind(currentMonth).first<{ bytes: number }>();
  return total?.bytes ?? 0;
}

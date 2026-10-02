// Push subscription persistence. Self-contained domain extracted from db.ts
// behind the db.ts re-export barrel (zero caller changes).
import type { Env } from '../types';

export interface PushSubscriptionRow {
  id: number;
  short_id: string;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export async function savePushSubscription(
  env: Env,
  userId: number,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).bind(userId, endpoint, p256dh, auth).run();
}

export async function getPushSubscriptionsForUser(
  env: Env,
  userId: number,
): Promise<PushSubscriptionRow[]> {
  const res = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .bind(userId)
    .all<PushSubscriptionRow>();
  return res.results ?? [];
}

export async function deletePushSubscription(env: Env, endpoint: string): Promise<void> {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
}

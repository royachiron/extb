import type { Env } from '../types';
import { getPushSubscriptionsForUser, deletePushSubscription } from '../db';
import { sendWebPush } from './webpush';

/**
 * Fire a web-push to every device a user has registered.
 *
 * Double-tap delivery: send once to wake the device radio, wait 1s, send again
 * to deliver the heads-up. Prunes 404/410 (gone) subscriptions. Guarded on VAPID
 * config; wrapped so it NEVER throws to the caller (push is best-effort).
 *
 * Extracted from postDm (api/dms.ts) so the ChatRoom DO can reuse it for the
 * offline-recipient case without duplicating the subs-fetch + double-tap logic.
 */
export async function pushToUser(
  env: Env,
  userId: number,
  payload: { title: string; body: string; url: string; from?: string; priority?: string; tag?: string; type?: string },
): Promise<void> {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured, skipping push notification');
      return;
    }
    const subs = await getPushSubscriptionsForUser(env, userId);
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      from: payload.from ?? '',
      priority: payload.priority ?? 'high',
      tag: payload.tag ?? '',
      type: payload.type ?? 'dm',
    });

    await Promise.all(subs.map(async (sub) => {
      try {
        const status = await sendWebPush(
          sub.endpoint, sub.p256dh, sub.auth, body,
          env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.COMMUNITY_ORIGIN || 'https://example.com',
        );
        if (status < 200 || status >= 300) {
          console.warn(`WebPush to ${userId} non-2xx status: ${status} (endpoint ${sub.endpoint.slice(0, 40)}…)`);
        }
        // 404/410 = gone; 403 = subscription minted under a stale VAPID key (FCM).
        // The client re-subscribes a fresh one (layout.ts), so dropping these is safe.
        if (status === 403 || status === 404 || status === 410) {
          await deletePushSubscription(env, sub.endpoint);
        }
      } catch (e) {
        console.error(`WebPush to ${userId} failed:`, e);
      }
    }));
  } catch (e) {
    console.error('pushToUser error:', e);
  }
}

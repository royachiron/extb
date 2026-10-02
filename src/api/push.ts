import type { AppContext } from '../types';
import { savePushSubscription } from '../db';
import { requireMember } from '../middleware';

const ALLOWED_PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some((re) => re.test(url.hostname));
}

export async function postPushSubscribe(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  const user = requireMember(ctx);

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return new Response('missing fields', { status: 400 });
  }
  if (!isAllowedPushEndpoint(endpoint)) {
    return new Response('unsupported push endpoint host', { status: 400 });
  }

  await savePushSubscription(ctx.env, user.id, endpoint, keys.p256dh, keys.auth);
  return new Response('ok', { status: 201 });
}


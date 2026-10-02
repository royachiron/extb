import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./webpush', () => ({ sendWebPush: vi.fn(async () => 403) }));
vi.mock('../db', () => ({
  getPushSubscriptionsForUser: vi.fn(async () => [{ endpoint: 'e1', p256dh: 'p', auth: 'a' }]),
  deletePushSubscription: vi.fn(async () => {}),
}));

import { pushToUser } from './notify';
import { sendWebPush } from './webpush';
import { deletePushSubscription } from '../db';

describe('pushToUser delivery', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends exactly once per subscription', async () => {
    const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } as any;
    await pushToUser(env, 7, { title: 't', body: 'b', url: '/dms' });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('prunes a subscription that returns 403', async () => {
    const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } as any;
    await pushToUser(env, 7, { title: 't', body: 'b', url: '/dms' });
    expect(deletePushSubscription).toHaveBeenCalledWith(env, 'e1');
  });
});

import { describe, it, expect } from 'vitest';
import { postMoveTopic } from '../src/api/topics-mod';

describe('postMoveTopic', () => {
  it('is exported as an async function with the (req, ctx, params) shape', () => {
    expect(typeof postMoveTopic).toBe('function');
    expect(postMoveTopic.length).toBe(3);
  });

  it('rejects non-mod (requireMod throws synchronously)', async () => {
    const ctx: any = {
      user: { id: 1, access_level: 'member', email_verified: 1, is_approved: 1, is_banned: 0 },
      env: {},
      csrfToken: '',
    };
    const req = new Request('https://x/t/abc/move', {
      method: 'POST',
      body: new URLSearchParams({ target_room_id: '2' }),
    });
    await expect(postMoveTopic(req, ctx, { id: 'abc' })).rejects.toBeDefined();
  });

  it('rejects anon (no user)', async () => {
    const ctx: any = { user: null, env: {}, csrfToken: '' };
    const req = new Request('https://x/t/abc/move', {
      method: 'POST',
      body: new URLSearchParams({ target_room_id: '2' }),
    });
    await expect(postMoveTopic(req, ctx, { id: 'abc' })).rejects.toBeDefined();
  });
});

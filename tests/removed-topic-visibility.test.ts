import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/db')>(),
  getTopicByShortId: vi.fn(),
  getRoomById: vi.fn(),
}));
import { getTopicByShortId, getRoomById } from '../src/db';
import { getTopic, getTopicPosts } from '../src/api/topics';
import type { AppContext } from '../src/types';

describe('removed introduction access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTopicByShortId).mockResolvedValue({
      id: 1, room_id: 2, user_id: 7, status: 'approved',
      deleted_at: null, removed_at: '2026-08-19 12:00:00',
      require_review: 0, delete_on_approve: 1,
    } as any);
    vi.mocked(getRoomById).mockResolvedValue({
      id: 2, slug: 'introductions', min_read: 'member', is_exclusive: 0,
    } as any);
  });

  it.each(['member', 'full'])('blocks %s users before loading the room or replies', async (access_level) => {
    const ctx = { env: {}, user: { id: 9, display_name: 'Viewer', email_verified: 1, is_approved: 1, access_level } } as AppContext;
    for (const handler of [getTopicPosts, getTopic]) {
      for (const htmx of [false, true]) {
        const response = await handler(new Request('https://extb.test/t/abc123', {
          headers: htmx ? { 'hx-request': 'true' } : {},
        }), ctx, { id: 'abc123' });
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('2026-08-19');
      }
    }
    expect(getRoomById).not.toHaveBeenCalled();
  });

  it.each(['mod', 'admin'])('preserves %s access to the removed thread', async (access_level) => {
    const ctx = { env: {}, user: { id: 9, display_name: 'Moderator', email_verified: 1, is_approved: 1, access_level } } as AppContext;
    // No pagination cursor: reaching this 400 means the visibility gate allowed access.
    const response = await getTopicPosts(new Request('https://extb.test/t/abc123/posts'), ctx, { id: 'abc123' });
    expect(response.status).toBe(400);
    expect(getRoomById).toHaveBeenCalled();
  });
});

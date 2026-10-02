import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireMember, checkRateLimit } = vi.hoisted(() => ({
  requireMember: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('../src/middleware', () => ({ requireMember }));
vi.mock('../src/lib/rate-limit', () => ({ checkRateLimit }));

import { postRenderMd } from '../src/api/utils';

const ctx = { user: { id: 42 } } as any;

function request(body: string): Request {
  return new Request('https://extb.test/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('postRenderMd', () => {
  beforeEach(() => {
    requireMember.mockReset();
    checkRateLimit.mockReset();
    requireMember.mockReturnValue({ id: 42 });
    checkRateLimit.mockReturnValue({ ok: true, retryAfterMs: 0 });
  });

  it('returns 401 instead of redirecting when signed out', async () => {
    requireMember.mockImplementation(() => {
      throw new Response(null, { status: 302, headers: { location: '/login' } });
    });

    const response = await postRenderMd(request('{"content":"hello"}'), ctx, {});
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/appeal', '/about/what-is-bid?verify=1', '/profile-setup'])(
    'returns 403 instead of redirecting for invalid member state %s',
    async (location) => {
      requireMember.mockImplementation(() => {
        throw new Response(null, { status: 302, headers: { location } });
      });

      const response = await postRenderMd(request('{"content":"hello"}'), ctx, {});
      expect(response.status).toBe(403);
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it.each([
    ['invalid JSON', '{'],
    ['non-string content', '{"content":123}'],
  ])('returns 400 for %s', async (_name, body) => {
    const response = await postRenderMd(request(body), ctx, {});
    expect(response.status).toBe(400);
  });

  it('returns 413 for content over 20,000 characters', async () => {
    const response = await postRenderMd(
      request(JSON.stringify({ content: 'x'.repeat(20_001) })),
      ctx,
      {},
    );
    expect(response.status).toBe(413);
  });

  it('limits each member to 60 renders per minute', async () => {
    checkRateLimit.mockReturnValue({ ok: false, retryAfterMs: 12_001 });
    const response = await postRenderMd(request('{"content":"hello"}'), ctx, {});

    expect(checkRateLimit).toHaveBeenCalledWith('render:user:42', 60, 60_000);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('13');
  });
});

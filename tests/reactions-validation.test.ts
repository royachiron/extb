import { describe, it, expect, vi } from 'vitest';
import type { AppContext, User } from '../src/types';

const toggleReaction = vi.fn(async () => {});
const getReactionsForPost = vi.fn(async () => []);

vi.mock('../src/db', () => ({
  toggleReaction: (...args: unknown[]) => (toggleReaction as any)(...args),
  getReactionsForPost: (...args: unknown[]) => (getReactionsForPost as any)(...args),
}));

const { postReact, postReactApi, ALLOWED_REACTIONS } = await import('../src/api/posts');

function makeCtx(): AppContext {
  const user = {
    id: 1,
    is_banned: 0,
    email_verified: 1, is_approved: 1,
    display_name: 'tester',
    access_level: 'member',
  } as unknown as User;
  return { user, env: {}, cookies: [] } as unknown as AppContext;
}

function formRequest(fields: Record<string, string>): Request {
  const form = new URLSearchParams(fields);
  return new Request('https://extb.test/p/1/react', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

describe('reaction emoji validation', () => {
  it('ALLOWED_REACTIONS is the canonical picker list', () => {
    expect(ALLOWED_REACTIONS).toContain('❤️');
    expect(ALLOWED_REACTIONS.length).toBeGreaterThan(0);
  });

  it('postReact rejects an arbitrary/unlisted emoji value with 400', async () => {
    toggleReaction.mockClear();
    const req = formRequest({ emoji: '<img src=x onerror=alert(1)>', isTopic: 'false' });
    const res = await postReact(req, makeCtx(), { id: '1' });
    expect(res.status).toBe(400);
    expect(toggleReaction).not.toHaveBeenCalled();
  });

  it('postReact accepts an allowed emoji', async () => {
    toggleReaction.mockClear();
    const req = formRequest({ emoji: ALLOWED_REACTIONS[0], isTopic: 'false' });
    const res = await postReact(req, makeCtx(), { id: '1' });
    expect(res.status).toBe(200);
    expect(toggleReaction).toHaveBeenCalledTimes(1);
  });

  it('postReactApi rejects an arbitrary/unlisted emoji value with 400', async () => {
    toggleReaction.mockClear();
    const req = formRequest({ emoji: 'not-a-real-reaction', isTopic: 'false' });
    const res = await postReactApi(req, makeCtx(), { id: '1' });
    expect(res.status).toBe(400);
    expect(toggleReaction).not.toHaveBeenCalled();
  });
});

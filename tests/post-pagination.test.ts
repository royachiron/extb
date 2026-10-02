import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  orderPostsDfs,
  listPostsForTopicPage,
} from '../src/db/post-pages';
import { renderLoadMorePosts } from '../src/views/topic';
import type { Env, Post } from '../src/types';

function post(id: number, parent: number | null, createdAt: string): Post {
  return { id, parent_post_id: parent, created_at: createdAt } as unknown as Post;
}

describe('cursor', () => {
  it('round-trips', () => {
    const c = { createdAt: '2026-07-01 10:20:30', id: 42 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it('rejects garbage', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('no-pipe')).toBeNull();
    expect(decodeCursor('2026-07-01 10:20:30|-5')).toBeNull();
    expect(decodeCursor('DROP TABLE|1')).toBeNull();
  });
});

describe('orderPostsDfs', () => {
  it('orders depth-first with children after parents', () => {
    const posts = [
      post(3, 1, '2026-01-01 00:03:00'),
      post(1, null, '2026-01-01 00:01:00'),
      post(4, null, '2026-01-01 00:04:00'),
      post(2, 1, '2026-01-01 00:02:00'),
    ];
    expect(orderPostsDfs(posts).map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });
  it('appends orphans whose parent is outside the set', () => {
    const posts = [post(1, null, '2026-01-01 00:01:00'), post(9, 999, '2026-01-01 00:02:00')];
    expect(orderPostsDfs(posts).map((p) => p.id)).toEqual([1, 9]);
  });
});

function mockEnv(pages: unknown[][]): { env: Env; sqls: string[]; binds: unknown[][] } {
  const sqls: string[] = [];
  const binds: unknown[][] = [];
  let call = 0;
  const prepare = (sql: string) => {
    sqls.push(sql);
    const stmt = {
      bind(...args: unknown[]) { binds.push(args); return stmt; },
      all: async () => ({ results: pages[call++] ?? [] }),
    };
    return stmt;
  };
  return { env: { DB: { prepare } } as unknown as Env, sqls, binds };
}

describe('listPostsForTopicPage', () => {
  it('seeks past the cursor and pages roots by limit+1', async () => {
    const roots = Array.from({ length: 3 }, (_, i) => post(i + 1, null, `2026-01-01 00:0${i + 1}:00`));
    const { env, sqls, binds } = mockEnv([roots, []]);
    const page = await listPostsForTopicPage(env, 7, 2, { createdAt: '2026-01-01 00:00:30', id: 5 }, false);

    expect(sqls[0]).toContain('p.parent_post_id IS NULL');
    expect(sqls[0]).toContain('(p.created_at, p.id) > (?, ?)');
    expect(sqls[0]).toContain("p.status = 'approved'");
    expect(binds[0]).toEqual([7, '2026-01-01 00:00:30', 5, 3]);

    expect(page.posts.map((p) => p.id)).toEqual([1, 2]);
    expect(page.nextCursor).toBe('2026-01-01 00:02:00|2');
    expect(sqls[1]).toContain('WITH RECURSIVE');
  });

  it('returns null cursor on final page and includes descendants', async () => {
    const roots = [post(1, null, '2026-01-01 00:01:00')];
    const kids = [post(2, 1, '2026-01-01 00:02:00')];
    const { env } = mockEnv([roots, kids]);
    const page = await listPostsForTopicPage(env, 7, 50, null, false);
    expect(page.nextCursor).toBeNull();
    expect(page.posts.map((p) => p.id)).toEqual([1, 2]);
  });

  it('mod view drops the approved/deleted filter but keeps removed_at', async () => {
    const { env, sqls } = mockEnv([[], []]);
    await listPostsForTopicPage(env, 7, 50, null, true);
    expect(sqls[0]).toContain('p.removed_at IS NULL');
    expect(sqls[0]).not.toContain("p.status = 'approved'");
  });
});

describe('renderLoadMorePosts', () => {
  it('renders empty slot without cursor, button with URL-encoded cursor otherwise', () => {
    expect(renderLoadMorePosts('abc123', null)).toBe('<div id="post-more"></div>');
    const html = renderLoadMorePosts('abc123', '2026-01-01 00:01:00|9');
    expect(html).toContain('hx-get="/t/abc123/posts?after=2026-01-01%2000%3A01%3A00%7C9"');
    expect(html).toContain('hx-target="#post-more"');
    expect(html).toContain('hx-swap="outerHTML"');
  });
});

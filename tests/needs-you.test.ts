import { describe, it, expect } from 'vitest';
import * as db from '../src/db';
import { canPost } from '../src/access';
import { renderNeedsYou } from '../src/views/feed';

/**
 * Needs You: the unanswered-thread queue that replaced the Forum nav slot.
 *
 * Two things here are security-relevant and get the most coverage:
 *   1. the SQL must carry every read-visibility filter listFeedTopics has, or
 *      gated/exclusive/blocked content leaks into the queue;
 *   2. the queue must only offer threads the viewer can actually REPLY to,
 *      which is canPost() - not expressible in SQL, applied in the handler.
 */

interface Call { sql: string; args: unknown[] }

function makeFakeDb(calls: Call[], rows: any[] = []) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          const isBlockedIdsLookup = sql.includes('user_blocks');
          return {
            all: async () => ({ results: isBlockedIdsLookup ? [{ blocked_id: 11 }] : rows }),
            first: async () => null,
            run: async () => {},
          };
        },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => {},
      };
    },
  };
}

function topicSql(calls: Call[]): string {
  const c = calls.find((x) => x.sql.includes('FROM topics'));
  if (!c) throw new Error('no topics query issued');
  return c.sql;
}

describe('listUnansweredTopics SQL contract', () => {
  async function run() {
    const calls: Call[] = [];
    const env = { DB: makeFakeDb(calls) } as any;
    await db.listUnansweredTopics(env, 42);
    return { calls, sql: topicSql(calls) };
  }

  it('carries every read-visibility filter listFeedTopics has', async () => {
    const { sql } = await run();
    expect(sql).toContain("t.status = 'approved'");
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain('r.is_locked = 0');
    expect(sql).toContain('t.require_review = 0 OR t.user_id = ?');
    expect(sql).toContain('r.is_exclusive = 0');
    expect(sql).toContain('room_permissions');
    expect(sql).toContain('t.user_id NOT IN'); // block filter, blockedIds = [11]
  });

  it('excludes removed introductions from the queue and its sidebar queries', async () => {
    for (const query of [
      (env: any) => db.listUnansweredTopics(env, 42),
      (env: any) => db.listFeedTopics(env, null, 5, 0, 42),
      (env: any) => db.listFeedTopics(env, 2, 5, 0, 42),
      (env: any) => db.getLatestReplies(env, 5, 42),
    ]) {
      const calls: Call[] = [];
      await query({ DB: makeFakeDb(calls) });
      const sql = calls.find(c => c.sql.includes('JOIN rooms'))!.sql;
      expect(sql).toContain('t.removed_at IS NULL');
    }
  });

  it('excludes pinned topics and the viewer\'s own threads', async () => {
    const { sql } = await run();
    expect(sql).toContain('t.is_pinned = 0');
    expect(sql).toContain('t.user_id IS NULL OR t.user_id != ?');
  });

  it('requires zero LIVE replies, counting posts rather than reply_count', async () => {
    const { sql } = await run();
    expect(sql).toMatch(/SELECT COUNT\(\*\) FROM posts p WHERE p\.topic_id = t\.id AND p\.status = 'approved' AND p\.deleted_at IS NULL\) = 0/);
  });

  it('never prefilters on reply_count, which is never decremented on delete', async () => {
    // A thread whose only replies were removed keeps reply_count > 0 while
    // having no live replies. Those are exactly the threads most in need of an
    // answer, so filtering on reply_count would hide them permanently.
    const { sql } = await run();
    expect(sql).not.toContain('t.reply_count');
    expect(sql).not.toContain('reply_count = 0');
  });

  it('orders oldest-first inside a bounded window', async () => {
    const { sql, calls } = await run();
    expect(sql).toContain('ORDER BY t.created_at ASC');
    expect(sql).toContain("t.created_at > datetime('now', ?)");
    const c = calls.find((x) => x.sql.includes('FROM topics'))!;
    expect(c.args).toContain(`-${db.UNANSWERED_WINDOW_DAYS} days`);
  });

  it('applies a safety LIMIT and no OFFSET, so canPost can filter exactly', async () => {
    const { sql, calls } = await run();
    expect(sql).toContain('LIMIT ?');
    expect(sql).not.toContain('OFFSET');
    const c = calls.find((x) => x.sql.includes('FROM topics'))!;
    expect(c.args).toContain(db.UNANSWERED_MAX_CANDIDATES);
  });

  it('honours a caller-supplied window and cap', async () => {
    const calls: Call[] = [];
    const env = { DB: makeFakeDb(calls) } as any;
    await db.listUnansweredTopics(env, 42, 7, 50);
    const c = calls.find((x) => x.sql.includes('FROM topics'))!;
    expect(c.args).toContain('-7 days');
    expect(c.args).toContain(50);
  });
});

describe('canPost gating of the queue', () => {
  // Mirrors prod room config: question/general are readable at 'anon' but only
  // postable at 'full'; introductions is postable at 'member'.
  const roomQuestion = { id: 1, slug: 'question', min_read: 'anon', min_post: 'full', is_exclusive: 0 } as any;
  const roomIntro = { id: 2, slug: 'introductions', min_read: 'member', min_post: 'member', is_exclusive: 0 } as any;
  const roomPrivate = { id: 3, slug: 'private', min_read: 'full', min_post: 'full', is_exclusive: 0 } as any;

  const member = { id: 5, display_name: 'mem', access_level: 'member', email_verified: 1, is_approved: 1 } as any;
  const full = { id: 6, display_name: 'full', access_level: 'full', email_verified: 1, is_approved: 1 } as any;

  it('a member cannot reply in a full-post room, so it must not be queued', () => {
    expect(canPost(member, roomQuestion)).toBe(false);
    expect(canPost(member, roomPrivate)).toBe(false);
  });

  it('a member can reply in introductions', () => {
    expect(canPost(member, roomIntro)).toBe(true);
  });

  it('a full member can reply in the trusted rooms', () => {
    expect(canPost(full, roomPrivate)).toBe(true);
  });

  it('an explicit read-only room grant blocks posting (fail-closed)', () => {
    // canPost reads room.user_permission. listRooms projects it; if it ever
    // arrives undefined this branch is skipped and evaluation falls through to
    // rank, which would fail OPEN for a user holding a read/blocked grant.
    const readOnly = { ...roomPrivate, user_permission: 'read' };
    expect(canPost(full, readOnly)).toBe(false);
    const blocked = { ...roomPrivate, user_permission: 'blocked' };
    expect(canPost(full, blocked)).toBe(false);
  });


});

describe('renderNeedsYou', () => {
  const rooms = [{ id: 3, name: 'Private', slug: 'private' }] as any;
  const base = { topTopics: [], latestReplies: [], topContributors: [], windowDays: 14 };
  const user = { id: 9, display_name: 'me', access_level: 'full' } as any;

  function topic(over: any = {}) {
    return {
      id: 1, short_id: 'abc123', room_id: 3, user_id: 7,
      author_display_name: 'Fyodor', title: 'A waiting thread',
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      ...over,
    };
  }

  it('renders an achievement-shaped empty state, not a void', () => {
    const out = renderNeedsYou({ ...base, user, rooms, topics: [] });
    expect(out).toContain('Nothing waiting');
    expect(out).toContain("Everyone's been answered");
  });

  it('escapes user-controlled title and author', () => {
    const out = renderNeedsYou({
      ...base, user, rooms,
      topics: [topic({ title: '<img src=x onerror=alert(1)>', author_display_name: '<script>x</script>' })],
    });
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;img src=x');
  });

  it('shows an anon handle rather than a user link for anonymous topics', () => {
    const out = renderNeedsYou({
      ...base, user, rooms,
      topics: [topic({ user_id: null, anon_name: 'anonymous' })],
    });
    expect(out).toContain('anonymous');
  });

  it('parses D1\'s space-separated, timezone-less created_at without NaN', () => {
    // D1 returns datetime('now') as 'YYYY-MM-DD HH:MM:SS' with no zone. Passing
    // that straight to Date.parse is implementation-defined and yields NaN in
    // some engines, which would render 'NaN days left'.
    const d = new Date(Date.now() - 3 * 86400000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const d1Format = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const out = renderNeedsYou({ ...base, user, rooms, topics: [topic({ created_at: d1Format })] });
    expect(out).not.toContain('NaN');
    expect(out).toContain('11 days left');
  });

  it('marks threads near the end of the window as urgent', () => {
    const old = topic({ created_at: new Date(Date.now() - 12 * 86400000).toISOString() });
    const fresh = topic({ created_at: new Date(Date.now() - 1 * 86400000).toISOString() });
    expect(renderNeedsYou({ ...base, user, rooms, topics: [old] })).toContain('ny-age--urgent');
    expect(renderNeedsYou({ ...base, user, rooms, topics: [fresh] })).not.toContain('ny-age--urgent');
  });

  it('carries no inline style or script blocks (HTMX-swapped partial)', () => {
    const out = renderNeedsYou({ ...base, user, rooms, topics: [topic()] });
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<style');
  });

  it('keeps the three index panels alive after the Forum tab was replaced', () => {
    const out = renderNeedsYou({
      ...base, user, rooms, topics: [],
      topTopics: [], latestReplies: [], topContributors: [],
    });
    expect(out).toContain('Top Topics');
    expect(out).toContain('Latest Replies');
    expect(out).toContain('Top Contributors');
  });
});

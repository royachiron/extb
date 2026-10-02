import { describe, it, expect } from 'vitest';
import { listConversations, listUnreadCountsFor, listDmsWith } from '../src/db/dms';
import {
  renderConversationsMore,
  renderConversationsPage,
  renderDmOlder,
  renderDmOlderPage,
} from '../src/views/dms';
import type { Env, DM, User } from '../src/types';

interface Call { sql: string; args: unknown[] }

/**
 * Fake D1 in the shape used across this suite (see db-sql-placeholders.test.ts).
 * NOTE: it records SQL, it never parses it - syntax is proven separately by
 * running each statement through `wrangler d1 execute --local`.
 */
function makeFakeDb(calls: Call[], rows: unknown[] = []) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return stmt;
        },
        all: async () => ({ results: rows }),
        first: async () => null,
        run: async () => {},
      };
      return stmt;
    },
  } as unknown as Env['DB'];
}

const env = (calls: Call[], rows: unknown[] = []) => ({ DB: makeFakeDb(calls, rows) } as unknown as Env);

/** The single query the call under test was expected to issue. */
function only(calls: Call[]): Call {
  const c = calls[0];
  if (!c) throw new Error('expected a query to be issued, but none was');
  return c;
}

const conv = (id: number) => ({
  other_id: id,
  last_id: id * 10,
  last_content: `msg ${id}`,
  last_created_at: '2026-07-01 10:00:00',
});

const dm = (id: number): DM => ({
  id,
  sender_id: 1,
  recipient_id: 2,
  content: `m${id}`,
  read_at: null,
  created_at: '2026-07-01 10:00:00',
});

describe('listConversations', () => {
  it('omits the id predicate on the first page', async () => {
    const calls: Call[] = [];
    await listConversations(env(calls), 7, 30, null);
    expect(only(calls).sql).not.toContain('last_dm_id <');
    expect(only(calls).args).toEqual([7, 31]);
  });

  it('seeks past the cursor on a later page', async () => {
    const calls: Call[] = [];
    await listConversations(env(calls), 7, 30, 500);
    expect(only(calls).sql).toContain('t.last_dm_id < ?');
    expect(only(calls).args).toEqual([7, 500, 31]);
  });

  it('reads the pointer table, not the whole dm history', async () => {
    const calls: Call[] = [];
    await listConversations(env(calls), 7, 30, null);
    expect(only(calls).sql).toContain('FROM dm_threads');
    // The old unbounded CTE is what this replaced.
    expect(only(calls).sql).not.toContain('WITH pairs');
  });

  it('orders by the id cursor, which never ties', async () => {
    const calls: Call[] = [];
    await listConversations(env(calls), 7, 30, null);
    expect(only(calls).sql).toContain('ORDER BY t.last_dm_id DESC');
  });

  it('fetches limit+1 and reports the boundary id when more remain', async () => {
    const rows = [conv(1), conv(2), conv(3)];
    const { conversations, nextBeforeId } = await listConversations(env([], rows), 7, 2, null);
    expect(conversations).toHaveLength(2);
    expect(nextBeforeId).toBe(20); // last_id of the last kept row
  });

  it('reports no further page when the result fits', async () => {
    const rows = [conv(1), conv(2)];
    const { conversations, nextBeforeId } = await listConversations(env([], rows), 7, 2, null);
    expect(conversations).toHaveLength(2);
    expect(nextBeforeId).toBeNull();
  });

  it('reports no further page for an empty inbox', async () => {
    const { conversations, nextBeforeId } = await listConversations(env([], []), 7, 30, null);
    expect(conversations).toEqual([]);
    expect(nextBeforeId).toBeNull();
  });
});

describe('listUnreadCountsFor', () => {
  it('issues no query for an empty page', async () => {
    const calls: Call[] = [];
    const counts = await listUnreadCountsFor(env(calls), 7, []);
    expect(calls).toHaveLength(0);
    expect(counts.size).toBe(0);
  });

  it('asks once for the whole visible page, not once per row', async () => {
    const calls: Call[] = [];
    await listUnreadCountsFor(env(calls), 7, [2, 3, 4]);
    expect(calls).toHaveLength(1);
    expect(only(calls).sql).toContain('GROUP BY sender_id');
    expect(only(calls).args).toEqual([7, 2, 3, 4]);
  });

  it('binds exactly one placeholder per argument', async () => {
    const calls: Call[] = [];
    await listUnreadCountsFor(env(calls), 7, [2, 3, 4]);
    const placeholders = (only(calls).sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(only(calls).args.length);
  });

  it('maps counts by the other party id', async () => {
    const rows = [{ other_id: 2, n: 3 }, { other_id: 4, n: 1 }];
    const counts = await listUnreadCountsFor(env([], rows), 7, [2, 3, 4]);
    expect(counts.get(2)).toBe(3);
    expect(counts.get(4)).toBe(1);
    expect(counts.has(3)).toBe(false); // no unread row => absent, treated as 0
  });
});

describe('listDmsWith', () => {
  it('seeks both pair directions and bounds each branch', async () => {
    const calls: Call[] = [];
    await listDmsWith(env(calls), 1, 2, 50, null);
    const { sql, args } = only(calls);
    expect(sql).toContain('UNION ALL');
    // Each branch is its own subquery - SQLite rejects ORDER BY/LIMIT on a
    // bare operand of a compound SELECT.
    expect(sql.match(/ORDER BY id DESC LIMIT \?/g)).toHaveLength(3);
    expect(args).toEqual([1, 2, 51, 2, 1, 51, 51]);
  });

  it('omits the id predicate on the first page rather than binding a sentinel', async () => {
    const calls: Call[] = [];
    await listDmsWith(env(calls), 1, 2, 50, null);
    // A MAX_SAFE_INTEGER cursor would put every first thread load on the
    // worst-case integer-binding boundary for no benefit.
    expect(only(calls).sql).not.toContain('id < ?');
    expect(only(calls).args).not.toContain(Number.MAX_SAFE_INTEGER);
  });

  it('adds the id predicate only on an older page', async () => {
    const calls: Call[] = [];
    await listDmsWith(env(calls), 1, 2, 50, 900);
    expect(only(calls).sql).toContain('id < ?');
  });

  it('uses the cursor as the seek bound on an older page', async () => {
    const calls: Call[] = [];
    await listDmsWith(env(calls), 1, 2, 50, 900);
    expect(only(calls).args).toEqual([1, 2, 900, 51, 2, 1, 900, 51, 51]);
  });

  it('binds exactly one placeholder per argument', async () => {
    const calls: Call[] = [];
    await listDmsWith(env(calls), 1, 2, 50, 900);
    const placeholders = (only(calls).sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(only(calls).args.length);
  });

  it('returns the newest page oldest-first, with the oldest id as cursor', async () => {
    // Query yields DESC; three rows for a limit of 2 means a further page.
    const rows = [dm(30), dm(20), dm(10)];
    const { dms, nextBeforeId } = await listDmsWith(env([], rows), 1, 2, 2, null);
    expect(dms.map((m) => m.id)).toEqual([20, 30]); // reversed to ASC for display
    expect(nextBeforeId).toBe(20); // oldest kept row
  });

  it('reports no further page once the thread start is reached', async () => {
    const rows = [dm(30), dm(20)];
    const { dms, nextBeforeId } = await listDmsWith(env([], rows), 1, 2, 2, null);
    expect(dms.map((m) => m.id)).toEqual([20, 30]);
    expect(nextBeforeId).toBeNull();
  });

  it('handles an empty thread', async () => {
    const { dms, nextBeforeId } = await listDmsWith(env([], []), 1, 2, 50, null);
    expect(dms).toEqual([]);
    expect(nextBeforeId).toBeNull();
  });
});

describe('load-more controls', () => {
  it('renders an inbox button carrying the cursor', () => {
    const html = renderConversationsMore(500);
    expect(html).toContain('hx-get="/api/dms/page?before=500"');
    expect(html).toContain('hx-target="#inbox-more"');
    expect(html).toContain('hx-swap="outerHTML"');
  });

  it('renders a bare inbox slot when exhausted, keeping the swap target', () => {
    expect(renderConversationsMore(null)).toBe('<div id="inbox-more"></div>');
  });

  it('renders a thread button carrying the cursor', () => {
    const html = renderDmOlder('Alice', 900);
    expect(html).toContain('hx-get="/api/dms/Alice/older?before=900"');
    expect(html).toContain('hx-target="#dm-older"');
  });

  it('url-encodes the display name in the thread cursor href', () => {
    expect(renderDmOlder('A B&C', 900)).toContain('/api/dms/A%20B%26C/older?before=900');
  });

  it('renders a bare thread slot when the thread start is loaded', () => {
    expect(renderDmOlder('Alice', null)).toBe('<div id="dm-older"></div>');
  });

  it('never emits an hx-vals js: expression - the thread already forces CSP unsafe-eval once', () => {
    expect(renderDmOlder('Alice', 900)).not.toContain('js:');
    expect(renderConversationsMore(500)).not.toContain('js:');
  });
});

describe('load-more fragments', () => {
  const user = (id: number): User => ({ id, display_name: `U${id}` } as User);

  it('appends inbox rows out-of-band and returns a fresh control', () => {
    const rows = [{ other: user(2), lastContent: 'hi', lastAt: '2026-07-01 10:00:00', unread: 0 }];
    const html = renderConversationsPage(rows, new Set<string>(), 300);
    expect(html).toContain('hx-swap-oob="beforeend:#inbox-items"');
    expect(html).toContain('hx-get="/api/dms/page?before=300"');
  });

  it('PREPENDS older messages - appending would put history at the bottom', () => {
    const html = renderDmOlderPage('Alice', [dm(10)], 1, 5);
    expect(html).toContain('hx-swap-oob="afterbegin:#dm-items"');
    expect(html).not.toContain('beforeend:#dm-items');
  });

  it('targets #dm-items, never #dm-thread, so the load-older control is not swept', () => {
    const html = renderDmOlderPage('Alice', [dm(10)], 1, 5);
    expect(html).not.toContain(':#dm-thread');
  });

  it('emits an empty control once the thread start is reached', () => {
    const html = renderDmOlderPage('Alice', [dm(10)], 1, null);
    expect(html).toContain('<div id="dm-older"></div>');
  });
});

import { describe, it, expect } from 'vitest';
// Imported statically at module scope, NOT via `await import('../src/db')`
// inside each test. The barrel pulls in the whole db module graph, and paying
// that transform inside a test body charges it to the 5s per-test timeout -
// the first test to run would intermittently blow the budget as the suite
// grew. At module scope the cost lands in collection instead.
import * as db from '../src/db';

// Regression guard for the SQL-bind conversion: several db.ts query builders
// used to interpolate userId/viewerId/blockedIds directly into the SQL
// string. They now use "?" placeholders instead, which only works if the
// number of "?" in the final SQL text exactly matches the number of values
// passed to .bind(). A silent off-by-one here doesn't throw at prepare()
// time - D1 either errors at execution or (worse) silently binds the wrong
// value to the wrong placeholder. This test intercepts every prepare/bind
// call and asserts the counts line up, without needing a real D1 database.

interface Call { sql: string; args: unknown[] }

function makeFakeDb(calls: Call[]) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          const isBlockedIdsLookup = sql.includes('user_blocks');
          return {
            all: async () => ({
              results: isBlockedIdsLookup ? [{ blocked_id: 11 }, { blocked_id: 22 }] : [],
            }),
            first: async () => null,
            run: async () => {},
          };
        },
        // Some call sites invoke .all()/.first()/.run() without .bind() at all.
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => {},
      };
    },
  };
}

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

function expectBalanced(calls: Call[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const { sql, args } of calls) {
    expect(args.length, `placeholder/arg mismatch in:\n${sql}`).toBe(countPlaceholders(sql));
  }
}

describe('db.ts query builders bind exactly as many args as "?" placeholders', () => {
  it('listRooms - anonymous and viewer-scoped', async () => {
    const calls: Call[] = [];
    const { listRooms } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await listRooms(env);
    await listRooms(env, 42);

    expectBalanced(calls);
  });

  it('listRoomsForIndex - anonymous and viewer-scoped', async () => {
    const calls: Call[] = [];
    const { listRoomsForIndex } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await listRoomsForIndex(env);
    await listRoomsForIndex(env, 42);

    expectBalanced(calls);
  });

  it('getLatestReplies - anonymous and viewer-scoped', async () => {
    const calls: Call[] = [];
    const { getLatestReplies } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await getLatestReplies(env, 5);
    await getLatestReplies(env, 5, 42);

    expectBalanced(calls);
  });

  it('listFeedTopics - anonymous, viewer-scoped, room-scoped, with blocked users', async () => {
    const calls: Call[] = [];
    const { listFeedTopics } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await listFeedTopics(env, null, 20, 0);
    await listFeedTopics(env, null, 20, 0, 42); // triggers getBlockedIds -> [11, 22]
    await listFeedTopics(env, 5, 20, 0, 42);

    expectBalanced(calls);
  });

  it('listUnansweredTopics - viewer-scoped, with blocked users', async () => {
    const calls: Call[] = [];
    const { listUnansweredTopics } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await listUnansweredTopics(env, 42); // triggers getBlockedIds -> [11, 22]
    await listUnansweredTopics(env, 42, 7, 50);

    expectBalanced(calls);
  });

  it('listFeedTopicsForMod - anonymous, viewer-scoped with blocked users, room-scoped', async () => {
    const calls: Call[] = [];
    const { listFeedTopicsForMod } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await listFeedTopicsForMod(env, null, 20, 0);
    await listFeedTopicsForMod(env, null, 20, 0, 42);
    await listFeedTopicsForMod(env, 5, 20, 0, 42);

    expectBalanced(calls);
  });

  it('getRecentTopicsByUser - anonymous and viewer-scoped', async () => {
    const calls: Call[] = [];
    const { getRecentTopicsByUser } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await getRecentTopicsByUser(env, 7, 10);
    await getRecentTopicsByUser(env, 7, 10, 42);

    expectBalanced(calls);
  });

  it('getRecentPostsByUser - anonymous and viewer-scoped', async () => {
    const calls: Call[] = [];
    const { getRecentPostsByUser } = db;
    const env = { DB: makeFakeDb(calls) } as any;

    await getRecentPostsByUser(env, 7, 10);
    await getRecentPostsByUser(env, 7, 10, 42);

    expectBalanced(calls);
  });
});

import { describe, it, expect } from 'vitest';
import { toggleChatReaction, getChatReactionCounts } from '../src/db';
import { linkifyChat } from '../src/views/chat';
import type { Env } from '../src/types';

// Minimal D1 fake mirroring tests/chat-scope.test.ts. `rows[0]` is what .first()
// returns, so seed [{id:1}] for the "row exists" branch and [] for "no row".
interface Captured { sql: string; binds: unknown[]; }
function fakeEnv(rows: unknown[] = []) {
  const calls: Captured[] = [];
  const DB = {
    prepare(sql: string) {
      const cap: Captured = { sql, binds: [] };
      const stmt = {
        bind(...args: unknown[]) { cap.binds = args; calls.push(cap); return stmt; },
        async all<T>() { return { results: rows as T[] }; },
        async first<T>() { return (rows[0] ?? null) as T | null; },
        async run() { return { meta: { last_row_id: 1, changes: 1 } }; },
      };
      return stmt;
    },
  };
  return { env: { DB } as unknown as Env, calls };
}

describe('toggleChatReaction', () => {
  it('INSERTs and returns "added" when no row exists', async () => {
    const { env, calls } = fakeEnv([]); // .first() -> null
    const r = await toggleChatReaction(env, 10, 42, '👍');
    expect(r).toBe('added');
    const insert = calls.find(c => c.sql.includes('INSERT INTO chat_reactions'));
    expect(insert).toBeDefined();
    expect(insert!.binds).toEqual([10, 42, '👍']);
    expect(calls.some(c => c.sql.startsWith('DELETE'))).toBe(false);
  });

  it('DELETEs and returns "removed" when the row exists', async () => {
    const { env, calls } = fakeEnv([{ id: 1 }]); // .first() -> truthy
    const r = await toggleChatReaction(env, 10, 42, '👍');
    expect(r).toBe('removed');
    const del = calls.find(c => c.sql.startsWith('DELETE FROM chat_reactions'));
    expect(del).toBeDefined();
    expect(del!.binds).toEqual([10, 42, '👍']);
    expect(calls.some(c => c.sql.includes('INSERT INTO'))).toBe(false);
  });
});

describe('getChatReactionCounts', () => {
  it('returns an empty map for empty input (no query)', async () => {
    const { env, calls } = fakeEnv([]);
    const m = await getChatReactionCounts(env, []);
    expect(m.size).toBe(0);
    expect(calls.length).toBe(0);
  });

  it('uses a bound IN-clause and splits user_ids to numbers', async () => {
    const { env, calls } = fakeEnv([
      { message_id: 5, emoji: '👍', count: 2, user_ids: '7,9' },
    ]);
    const m = await getChatReactionCounts(env, [5, 6]);
    expect(calls[0]!.sql).toContain('message_id IN (?,?)');
    expect(calls[0]!.binds).toEqual([5, 6]);
    expect(m.get(5)).toEqual([{ emoji: '👍', count: 2, userIds: [7, 9] }]);
  });

  // Mirrors the {emoji,count,mine} mapping the DO sendBacklog attaches to ROOM
  // backlog rows: userIds never hit the wire; mine = viewer in userIds.
  it('maps grouped counts to {emoji,count,mine} for the backlog viewer', async () => {
    const { env } = fakeEnv([
      { message_id: 5, emoji: '👍', count: 2, user_ids: '7,9' },
      { message_id: 5, emoji: '🔥', count: 1, user_ids: '3' },
    ]);
    const map = await getChatReactionCounts(env, [5]);
    const authorId = 9;
    const reactions = (map.get(5) ?? []).map((g) => ({
      emoji: g.emoji,
      count: g.count,
      mine: authorId != null && g.userIds.includes(authorId),
    }));
    expect(reactions).toEqual([
      { emoji: '👍', count: 2, mine: true },
      { emoji: '🔥', count: 1, mine: false },
    ]);
    // No userIds leak onto the wire shape.
    expect(reactions.every((r) => !('userIds' in r))).toBe(true);
  });

  it('guest (authorId null) backlog reactions are never mine', async () => {
    const { env } = fakeEnv([
      { message_id: 5, emoji: '👍', count: 2, user_ids: '7,9' },
    ]);
    const map = await getChatReactionCounts(env, [5]);
    const authorId: number | null = null;
    const reactions = (map.get(5) ?? []).map((g) => ({
      emoji: g.emoji,
      count: g.count,
      mine: authorId != null && g.userIds.includes(authorId),
    }));
    expect(reactions).toEqual([{ emoji: '👍', count: 2, mine: false }]);
  });
});

describe('linkifyChat forum-thread autolink', () => {
  it('links a bare t/<id>', () => {
    expect(linkifyChat('see t/B1A2C3 now')).toBe(
      'see <a href="/t/B1A2C3" class="chat-link">t/B1A2C3</a> now',
    );
  });

  it('preserves a #post-<anchor>', () => {
    expect(linkifyChat('t/B1A2C3#post-t51')).toBe(
      '<a href="/t/B1A2C3#post-t51" class="chat-link">t/B1A2C3#post-t51</a>',
    );
  });

  it('does NOT double-wrap a full internal URL (discriminating case)', () => {
    const out = linkifyChat('https://extb.test/t/B1A2C3');
    // Exactly one anchor, no inner t/ anchor nested in the href.
    expect(out.match(/<a /g)!.length).toBe(1);
    expect(out).not.toContain('href="/t/B1A2C3" class="chat-link">t/');
    expect(out).toContain('href="https://extb.test/t/B1A2C3"');
  });

  it('does not match letter-preceded t/ (e.g. foot/ball)', () => {
    expect(linkifyChat('foot/ball')).toBe('foot/ball');
  });
});

import { describe, it, expect } from 'vitest';
import {
  selectChatBacklog,
  insertChatMessage,
  softDeleteChatMessage,
  getReplyParent,
  getChatMessageScope,
  CHAT_MSG_COLS,
} from '../src/db/chat-messages';
import type { Env } from '../src/types';

// Minimal D1 fake: records every prepared SQL + bound args, returns canned rows.
interface Captured {
  sql: string;
  binds: unknown[];
}

function fakeEnv(rows: unknown[] = []) {
  const calls: Captured[] = [];
  const DB = {
    prepare(sql: string) {
      const cap: Captured = { sql, binds: [] };
      const stmt = {
        bind(...args: unknown[]) {
          cap.binds = args;
          calls.push(cap);
          return stmt;
        },
        async all<T>() {
          return { results: rows as T[] };
        },
        async first<T>() {
          return (rows[0] ?? null) as T | null;
        },
        async run() {
          return { meta: { last_row_id: 1, changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { env: { DB } as unknown as Env, calls };
}

describe('selectChatBacklog', () => {
  it('default window filters scope + excludes soft-deleted, binds [scope, limit]', async () => {
    const { env, calls } = fakeEnv([]);
    await selectChatBacklog(env, 'room:chat', 0, 50);
    expect(calls[0]!.sql).toContain('scope = ?');
    expect(calls[0]!.sql).toContain('deleted_at IS NULL');
    expect(calls[0]!.sql).toContain('ORDER BY id DESC LIMIT ?');
    expect(calls[0]!.sql).not.toContain('id > ?');
    expect(calls[0]!.binds).toEqual(['room:chat', 50]);
  });

  it('since-id window adds AND id > ? and binds [scope, sinceId, limit]', async () => {
    const { env, calls } = fakeEnv([]);
    await selectChatBacklog(env, 'room:club', 99, 50);
    expect(calls[0]!.sql).toContain('AND id > ?');
    expect(calls[0]!.binds).toEqual(['room:club', 99, 50]);
  });

  it('reverses DESC rows into chronological order', async () => {
    const { env } = fakeEnv([{ id: 3 }, { id: 2 }, { id: 1 }]);
    const out = await selectChatBacklog(env, 'room:chat', 0, 50);
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('uses the shared column list, never SELECT *', async () => {
    const { env, calls } = fakeEnv([]);
    await selectChatBacklog(env, 'room:chat', 0, 50);
    expect(calls[0]!.sql).toContain(CHAT_MSG_COLS);
    expect(calls[0]!.sql).not.toContain('SELECT *');
  });
});

describe('insertChatMessage', () => {
  it('binds the 8 columns in order then re-selects the row', async () => {
    const { env, calls } = fakeEnv([{ id: 1, author_name: 'Alice' }]);
    await insertChatMessage(env, {
      author_name: 'Alice',
      content: 'hi',
      ip: '1.2.3.4',
      scope: 'room:club',
      author_id: 42,
      reply_to_id: 99,
      reply_to_author: 'Bob',
      reply_to_excerpt: 'orig',
    });
    expect(calls[0]!.sql).toContain('INSERT INTO chat_messages');
    expect(calls[0]!.binds).toEqual(['Alice', 'hi', '1.2.3.4', 'room:club', 42, 99, 'Bob', 'orig']);
    // second prepared call is the re-select by last_row_id
    expect(calls[1]!.sql).toContain(CHAT_MSG_COLS);
    expect(calls[1]!.binds).toEqual([1]);
  });
});

describe('softDeleteChatMessage', () => {
  it('scope-guarded UPDATE deleted_at, binds [id, scope], never hard DELETE', async () => {
    const { env, calls } = fakeEnv([]);
    await softDeleteChatMessage(env, 7, 'room:chat');
    expect(calls[0]!.sql).toContain('UPDATE chat_messages SET deleted_at');
    expect(calls[0]!.sql).toContain('AND scope = ? AND deleted_at IS NULL');
    expect(calls[0]!.sql).not.toContain('DELETE FROM');
    expect(calls[0]!.binds).toEqual([7, 'room:chat']);
  });

  it('returns rows changed', async () => {
    const { env } = fakeEnv([]);
    expect(await softDeleteChatMessage(env, 7, 'room:chat')).toBe(1);
  });
});

describe('getReplyParent', () => {
  it('looks up author_name + content within scope', async () => {
    const { env, calls } = fakeEnv([{ author_name: 'Bob', content: 'orig' }]);
    const parent = await getReplyParent(env, 99, 'room:chat');
    expect(calls[0]!.sql).toContain('SELECT author_name, content FROM chat_messages');
    expect(calls[0]!.binds).toEqual([99, 'room:chat']);
    expect(parent).toEqual({ author_name: 'Bob', content: 'orig' });
  });
});

describe('getChatMessageScope', () => {
  it('returns the scope string or null', async () => {
    const { env, calls } = fakeEnv([{ scope: 'room:club' }]);
    expect(await getChatMessageScope(env, 5)).toBe('room:club');
    expect(calls[0]!.binds).toEqual([5]);
    const { env: empty } = fakeEnv([]);
    expect(await getChatMessageScope(empty, 5)).toBe(null);
  });
});

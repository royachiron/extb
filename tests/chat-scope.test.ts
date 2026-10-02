import { describe, it, expect } from 'vitest';
import {
  getChatMessages,
  createChatMessage,
  deleteChatMessage,
  getLastChatMessageTime,
} from '../src/db';
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

describe('chat scope threading (db helpers)', () => {
  it('getChatMessages filters by scope and excludes soft-deleted, default scope room:chat', async () => {
    const { env, calls } = fakeEnv([]);
    await getChatMessages(env);
    expect(calls[0]!.sql).toContain('scope = ?');
    expect(calls[0]!.sql).toContain('deleted_at IS NULL');
    expect(calls[0]!.binds).toEqual(['room:chat', 50]);
  });

  it('getChatMessages passes a custom scope through', async () => {
    const { env, calls } = fakeEnv([]);
    await getChatMessages(env, 25, 'room:club-lounge');
    expect(calls[0]!.binds).toEqual(['room:club-lounge', 25]);
  });

  it('createChatMessage writes scope + author_id', async () => {
    const { env, calls } = fakeEnv([]);
    await createChatMessage(env, 'Alice', 'hi', '1.2.3.4', 'room:club-lounge', 42);
    expect(calls[0]!.sql).toContain('INSERT INTO chat_messages');
    expect(calls[0]!.sql).toContain('scope');
    expect(calls[0]!.sql).toContain('author_id');
    // reply_* default to null (additive, no parent supplied).
    expect(calls[0]!.binds).toEqual(['Alice', 'hi', '1.2.3.4', 'room:club-lounge', 42, null, null, null]);
  });

  it('createChatMessage defaults scope=room:chat and author_id=null', async () => {
    const { env, calls } = fakeEnv([]);
    await createChatMessage(env, 'Bob', 'yo', null);
    expect(calls[0]!.binds).toEqual(['Bob', 'yo', null, 'room:chat', null, null, null, null]);
  });

  it('createChatMessage carries denormalized reply parent (id, author, excerpt)', async () => {
    const { env, calls } = fakeEnv([]);
    await createChatMessage(env, 'Carol', 'replying', null, 'room:chat', 7, 99, 'Bob', 'original text');
    expect(calls[0]!.sql).toContain('reply_to_id');
    expect(calls[0]!.sql).toContain('reply_to_author');
    expect(calls[0]!.sql).toContain('reply_to_excerpt');
    expect(calls[0]!.binds).toEqual(['Carol', 'replying', null, 'room:chat', 7, 99, 'Bob', 'original text']);
  });

  it('deleteChatMessage is a soft delete (UPDATE ... deleted_at), not a hard DELETE', async () => {
    const { env, calls } = fakeEnv([]);
    await deleteChatMessage(env, 7);
    expect(calls[0]!.sql).toContain('UPDATE chat_messages SET deleted_at');
    expect(calls[0]!.sql).not.toContain('DELETE FROM');
    expect(calls[0]!.binds).toEqual([7]);
  });

  it('getLastChatMessageTime wraps the OR in parens before AND scope (precedence guard)', async () => {
    const { env, calls } = fakeEnv([]);
    await getLastChatMessageTime(env, 'Alice', '1.2.3.4', 'room:club-lounge');
    const sql = calls[0]!.sql;
    // The OR must be parenthesised so scope filters BOTH branches, not just ip.
    expect(sql).toContain('(author_name = ? OR (ip = ? AND ip IS NOT NULL)) AND scope = ?');
    expect(calls[0]!.binds).toEqual(['Alice', '1.2.3.4', 'room:club-lounge']);
  });
});

import { describe, it, expect } from 'vitest';
import { createDm } from '../src/db';
import { pushToUser } from '../src/lib/notify';
import type { Env } from '../src/types';

interface Captured { sql: string; binds: unknown[]; }

// Minimal D1 fake: first() returns the first canned row, run() returns last_row_id.
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

describe('createDm', () => {
  it('returns the inserted row identity ({id, created_at})', async () => {
    // Return current approved accounts for authorization and the inserted DM row.
    const calls: Captured[] = [];
    const DB = {
      prepare(sql: string) {
        const cap: Captured = { sql, binds: [] };
        const stmt = {
          bind(...args: unknown[]) { cap.binds = args; calls.push(cap); return stmt; },
          async all<T>() { return { results: [] as T[] }; },
          async first<T>() {
            if (sql.includes('FROM settings')) return null;
            if (sql.includes('SELECT * FROM users')) return { id: cap.binds[0], is_banned: 0, is_approved: 1, access_level: 'member', posting_restricted_at: null } as unknown as T;
            return { id: 42, sender_id: 1, recipient_id: 2, content: 'hi', read_at: null, created_at: '2026-06-01 00:00:00' } as unknown as T;
          },
          async run() { return { meta: { last_row_id: 42, changes: 1 } }; },
        };
        return stmt;
      },
    };
    const env = { DB } as unknown as Env;
    const row = await createDm(env, 1, 2, 'hi');
    expect(row.id).toBe(42);
    expect(row.created_at).toBe('2026-06-01 00:00:00');
  });
});

describe('pushToUser', () => {
  it('no-ops (no DB hit) when VAPID keys are missing', async () => {
    const { env, calls } = fakeEnv([]);
    await expect(pushToUser(env, 99, { title: 't', body: 'b', url: '/x' })).resolves.toBeUndefined();
    // No subs query should run when the VAPID guard short-circuits.
    expect(calls.length).toBe(0);
  });

  it('never throws even if the DB blows up', async () => {
    const env = {
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      DB: { prepare() { throw new Error('db down'); } },
    } as unknown as Env;
    await expect(pushToUser(env, 99, { title: 't', body: 'b', url: '/x' })).resolves.toBeUndefined();
  });
});

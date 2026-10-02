import { describe, expect, it, vi } from 'vitest';
import { grantCapability, hasCapability, revokeCapability } from '../src/db/user-capabilities';

function envWithRows(rows: any[] = []) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const prepare = vi.fn((sql: string) => {
    const call = { sql, binds: [] as unknown[] };
    calls.push(call);
    return {
      bind: (...binds: unknown[]) => {
        call.binds = binds;
        return {
          first: async () => rows.shift() ?? null,
          run: async () => ({}),
        };
      },
    };
  });
  return { env: { DB: { prepare } } as any, calls };
}

describe('user capabilities', () => {
  it('checks whether a user has club capability', async () => {
    const { env, calls } = envWithRows([{ x: 1 }]);

    await expect(hasCapability(env, 42, 'club')).resolves.toBe(true);

    expect(calls[0]!.sql).toContain('FROM user_capabilities');
    expect(calls[0]!.binds).toEqual([42, 'club']);
  });

  it('grants and revokes club capability', async () => {
    const { env, calls } = envWithRows();

    await grantCapability(env, 42, 'club', 7, 'confirmed disability');
    await revokeCapability(env, 42, 'club');

    expect(calls[0]!.sql).toContain('INSERT INTO user_capabilities');
    expect(calls[0]!.binds).toEqual([42, 'club', 7, 'confirmed disability']);
    expect(calls[1]!.sql).toContain('DELETE FROM user_capabilities');
    expect(calls[1]!.binds).toEqual([42, 'club']);
  });
});

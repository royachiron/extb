import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/types';
import { hashPassword, verifyPassword, hashPasswordForEnv, verifyPasswordForEnv } from '../src/auth';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
import { PasswordHasher } from '../src/password-hasher';

describe('password hashing RPC', () => {
  const service = new PasswordHasher({} as DurableObjectState, {} as Env);
  const salt = 'test-unique-salt';
  const password = 'private-password-123';

  it('has identical strong hashes and verification results to the local implementation', async () => {
    const hash = await service.hashPassword(password, salt);
    expect(hash).toBe(await hashPassword(password, salt));
    expect(await service.verifyPassword(password, salt, hash)).toBe(true);
    expect(await service.verifyPassword('wrong', salt, hash)).toBe(false);
    expect(await service.verifyPassword(password, salt, 'malformed')).toBe(false);
  });

  it('routes hashing and verification through the internal namespace without changing the protocol', async () => {
    const get = vi.fn(() => service);
    const idFromName = vi.fn(() => 'object-id');
    const env = { PASSWORD_HASHER: { get, idFromName } } as unknown as Env;
    const hash = await hashPasswordForEnv(env, password, salt);
    expect(await verifyPasswordForEnv(env, password, salt, hash)).toBe(true);
    expect(idFromName).toHaveBeenCalledWith('password-hasher');
    expect(get).toHaveBeenCalledWith('object-id');
  });

  it('falls back in isolated tests with no binding and rejects oversized internal requests', async () => {
    const env = {} as Env;
    const hash = await hashPasswordForEnv(env, password, salt);
    expect(await verifyPasswordForEnv(env, password, salt, hash)).toBe(await verifyPassword(password, salt, hash));
    await expect(service.hashPassword('x'.repeat(257), salt)).rejects.toThrow('Invalid password hashing input');
    await expect(service.hashPassword(password, 'x'.repeat(1025))).rejects.toThrow('Invalid password hashing input');
  });
});

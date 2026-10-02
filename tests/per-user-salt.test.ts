// Per-user salt sanity tests. Verifies the hash function actually
// differentiates output by salt, that legacy verification still works
// against the old global-salt hash, and that generated salts are unique.

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateSalt } from '../src/auth';

describe('per-user salt', () => {
  it('different salts produce different hashes for same password', async () => {
    const h1 = await hashPassword('secret123', 'salt-A');
    const h2 = await hashPassword('secret123', 'salt-B');
    expect(h1).not.toBe(h2);
  });

  it('same salt + same password is deterministic', async () => {
    const h1 = await hashPassword('secret123', 'salt-X');
    const h2 = await hashPassword('secret123', 'salt-X');
    expect(h1).toBe(h2);
  });

  it('verifyPassword rejects with wrong salt', async () => {
    const h = await hashPassword('secret123', 'salt-A');
    expect(await verifyPassword('secret123', 'salt-A', h)).toBe(true);
    expect(await verifyPassword('secret123', 'salt-B', h)).toBe(false);
  });

  it('legacy global-salt hash still verifies against same global salt', async () => {
    // Simulates the legacy users.password_salt = NULL path: hash was
    // produced with env.PASSWORD_SALT, login still passes that salt in.
    const globalSalt = 'global-pepper-value';
    const legacyHash = await hashPassword('hunter2', globalSalt);
    expect(await verifyPassword('hunter2', globalSalt, legacyHash)).toBe(true);
  });

  it('generateSalt produces unique values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const s = generateSalt();
      expect(s.length).toBeGreaterThan(0);
      seen.add(s);
    }
    expect(seen.size).toBe(100);
  });

  it('generateSalt default length is 16 bytes (base64 = 24 chars with =)', () => {
    const s = generateSalt();
    // 16 bytes base64 -> "xxxxxxxxxxxxxxxxxxxxxx==" (24 chars)
    expect(s).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('verifyPassword fails on malformed hash without throwing', async () => {
    expect(await verifyPassword('x', 'salt', 'not-base64-!!!')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  sessionCookie,
  clearCookie,
} from '../src/auth';

const SALT = 'test-salt-value';

describe('hashPassword + verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('hunter2', SALT);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword('hunter2', SALT, hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('hunter2', SALT);
    expect(await verifyPassword('wrong', SALT, hash)).toBe(false);
  });

  it('rejects when expectedHash is malformed', async () => {
    expect(await verifyPassword('hunter2', SALT, 'not-base64!!!')).toBe(false);
  });
});

describe('generateToken', () => {
  it('returns 64 hex chars by default', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns 2*N hex chars for N bytes', () => {
    expect(generateToken(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces distinct tokens on successive calls', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('sessionCookie', () => {
  it('contains required flags for a 30-day session', () => {
    const c = sessionCookie('abc123', 30);
    expect(c).toContain('session=abc123');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=2592000');
  });
});

describe('clearCookie', () => {
  it('expires the session cookie', () => {
    const c = clearCookie();
    expect(c).toContain('session=');
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('Path=/');
  });
});

// NOTE: src/email.ts (Brevo wrapper) is not unit-tested here - it makes a
// real HTTPS call. Verify manually after `wrangler secret put BREVO_API_KEY`
// by triggering /register in `wrangler dev` and confirming the email arrives.

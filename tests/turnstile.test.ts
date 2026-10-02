import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTurnstile } from '../src/lib/turnstile';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when TURNSTILE_SECRET is unset (skip)', async () => {
    const env = {} as any;
    const ok = await verifyTurnstile(env, 'any-token', '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('returns true when siteverify responds success:true', async () => {
    const env = { TURNSTILE_SECRET: 'sek' } as any;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: true }), { status: 200 }
    )));
    const ok = await verifyTurnstile(env, 'good-token', '1.2.3.4');
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns false when siteverify responds success:false', async () => {
    const env = { TURNSTILE_SECRET: 'sek' } as any;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
      { status: 200 }
    )));
    const ok = await verifyTurnstile(env, 'bad-token', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false when no token provided and secret is set', async () => {
    const env = { TURNSTILE_SECRET: 'sek' } as any;
    const ok = await verifyTurnstile(env, '', '1.2.3.4');
    expect(ok).toBe(false);
  });
});

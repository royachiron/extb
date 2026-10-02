import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, _resetForTests, getClientIp } from '../src/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useRealTimers();
  });

  it('admits up to max within window', () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit('k', 5, 60_000);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects the (max+1)-th attempt', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('k', 5, 60_000);
    const r = checkRateLimit('k', 5, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('admits again after the window slides', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit('k', 3, 1000);
      expect(r.ok).toBe(true);
    }
    expect(checkRateLimit('k', 3, 1000).ok).toBe(false);
    vi.setSystemTime(1500);
    expect(checkRateLimit('k', 3, 1000).ok).toBe(true);
  });

  it('separate keys do not share buckets', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('a', 5, 60_000);
    expect(checkRateLimit('a', 5, 60_000).ok).toBe(false);
    expect(checkRateLimit('b', 5, 60_000).ok).toBe(true);
  });

  it('retry-after reflects time until oldest slot expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkRateLimit('k', 1, 10_000);
    vi.setSystemTime(3000);
    const r = checkRateLimit('k', 1, 10_000);
    expect(r.ok).toBe(false);
    // Oldest was at t=0, window 10s, now t=3s. retryAfter = 10000 - 3000 = 7000.
    expect(r.retryAfterMs).toBe(7000);
  });
});

describe('getClientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const req = new Request('https://x/', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('https://x/', {
      headers: { 'x-real-ip': '5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('falls back to first x-forwarded-for', () => {
    const req = new Request('https://x/', {
      headers: { 'x-forwarded-for': '9.9.9.9, 1.1.1.1' },
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('returns "unknown" when no headers present', () => {
    const req = new Request('https://x/');
    expect(getClientIp(req)).toBe('unknown');
  });
});

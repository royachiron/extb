import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPrivateIp, resolvesToPrivateIp } from '../src/lib/unfurls';

describe('isPrivateIp', () => {
  it('flags private/loopback/link-local ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('allows public IPs', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });
});

describe('resolvesToPrivateIp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks IP literals directly without a DNS lookup', async () => {
    expect(await resolvesToPrivateIp('127.0.0.1')).toBe(true);
    expect(await resolvesToPrivateIp('8.8.8.8')).toBe(false);
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ Answer: [{ data: '169.254.169.254' }] }),
    } as any)));
    expect(await resolvesToPrivateIp('metadata.internal.example')).toBe(true);
  });

  it('allows a hostname that resolves to a public IP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as any)));
    expect(await resolvesToPrivateIp('example.com')).toBe(false);
  });

  it('fails closed if the DNS lookup itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await resolvesToPrivateIp('example.com')).toBe(true);
  });
});

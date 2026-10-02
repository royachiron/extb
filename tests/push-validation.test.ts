import { describe, it, expect } from 'vitest';
import { isAllowedPushEndpoint } from '../src/api/push';

describe('isAllowedPushEndpoint', () => {
  it('allows real push-service endpoints', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://sub.notify.windows.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
  });

  it('rejects non-TLS endpoints', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc123')).toBe(false);
  });

  it('rejects an SSRF-style internal address', () => {
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects an unrelated host', () => {
    expect(isAllowedPushEndpoint('https://evil.com/collect')).toBe(false);
  });

  it('rejects a subdomain-suffix bypass attempt', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false);
  });
});

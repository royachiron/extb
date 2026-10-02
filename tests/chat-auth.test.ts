import { describe, it, expect, vi, afterEach } from 'vitest';
import { signChatAuth, verifyChatAuth } from '../src/lib/chat-auth';

const SECRET = 'test-secret-do-not-use-in-prod';

describe('chat-auth HMAC token', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies a token signed with matching fields', async () => {
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, true);
    expect(await verifyChatAuth(SECRET, token, 7, 'room:chat', false, true)).toBe(true);
  });

  it('rejects a token whose scope was swapped after signing', async () => {
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, true);
    expect(await verifyChatAuth(SECRET, token, 7, 'room:other', false, true)).toBe(false);
  });

  it('rejects a token whose authorId was swapped after signing', async () => {
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, true);
    expect(await verifyChatAuth(SECRET, token, 8, 'room:chat', false, true)).toBe(false);
  });

  it('rejects a token whose mod/post flags were escalated after signing', async () => {
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, false);
    expect(await verifyChatAuth(SECRET, token, 7, 'room:chat', true, false)).toBe(false);
    expect(await verifyChatAuth(SECRET, token, 7, 'room:chat', false, true)).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, true);
    expect(await verifyChatAuth('wrong-secret', token, 7, 'room:chat', false, true)).toBe(false);
  });

  it('rejects garbage tokens', async () => {
    expect(await verifyChatAuth(SECRET, '', 7, 'room:chat', false, true)).toBe(false);
    expect(await verifyChatAuth(SECRET, 'not-a-token', 7, 'room:chat', false, true)).toBe(false);
    expect(await verifyChatAuth(SECRET, 'a.b.c', 7, 'room:chat', false, true)).toBe(false);
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const token = await signChatAuth(SECRET, 7, 'room:chat', false, true);
    vi.setSystemTime(120_000); // past the 60s TTL
    expect(await verifyChatAuth(SECRET, token, 7, 'room:chat', false, true)).toBe(false);
  });

  it('handles a null (guest) authorId consistently', async () => {
    const token = await signChatAuth(SECRET, null, 'room:chat', false, false);
    expect(await verifyChatAuth(SECRET, token, null, 'room:chat', false, false)).toBe(true);
    expect(await verifyChatAuth(SECRET, token, 1, 'room:chat', false, false)).toBe(false);
  });
});

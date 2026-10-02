import { describe, it, expect } from 'vitest';
import { chatPendingMatch, chatSendDelay } from '../src/views/chat-message';

describe('chatPendingMatch (optimistic echo reconciliation)', () => {
  const pending = [{ content: 'hi' }, { content: 'second' }, { content: 'hi' }];

  it('matches the OLDEST pending entry with the same content', () => {
    expect(chatPendingMatch(pending, { author_name: 'me', content: 'hi' }, 'me')).toBe(0);
    expect(chatPendingMatch(pending, { author_name: 'me', content: 'second' }, 'me')).toBe(1);
  });

  it('does not match someone else saying the same thing', () => {
    expect(chatPendingMatch(pending, { author_name: 'other', content: 'hi' }, 'me')).toBe(-1);
  });

  it('does not match when content differs', () => {
    expect(chatPendingMatch(pending, { author_name: 'me', content: 'hi!' }, 'me')).toBe(-1);
  });

  it('never matches for an empty viewer name (guests)', () => {
    expect(chatPendingMatch(pending, { author_name: '', content: 'hi' }, '')).toBe(-1);
  });

  it('returns -1 on an empty pending list', () => {
    expect(chatPendingMatch([], { author_name: 'me', content: 'hi' }, 'me')).toBe(-1);
  });
});

describe('chatSendDelay (cooldown queue)', () => {
  it('sends immediately when the gap has passed', () => {
    expect(chatSendDelay(1000, 3200, 2100)).toBe(0);
    expect(chatSendDelay(0, 5, 2100)).toBe(0);
  });

  it('waits the remainder of the gap', () => {
    expect(chatSendDelay(1000, 1500, 2100)).toBe(1600);
  });
});

describe('injected browser source', () => {
  it('serialized helpers are self-contained JS (no TS syntax, no closures)', () => {
    for (const fn of [chatPendingMatch, chatSendDelay]) {
      const src = 'var f = ' + fn.toString() + ';';
      expect(() => new Function(src)).not.toThrow();
    }
    const f = new Function('return ' + chatPendingMatch.toString())();
    expect(f([{ content: 'a' }], { author_name: 'x', content: 'a' }, 'x')).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { initials } from '../src/views/profile';

describe('initials', () => {
  it('two-word display name uses first letter of each part', () => {
    expect(initials('alice_smith')).toBe('AS');
  });
  it('single char name returns uppercase char', () => {
    expect(initials('x')).toBe('X');
  });
  it('single word uses first two letters', () => {
    expect(initials('alice')).toBe('AL');
  });
  it('handles empty string', () => {
    expect(initials('')).toBe('?');
  });
  it('handles dash separator', () => {
    expect(initials('bob-jones')).toBe('BJ');
  });
});

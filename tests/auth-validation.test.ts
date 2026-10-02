import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidPassword, isValidDisplayName } from '../src/api/auth';

describe('isValidEmail', () => {
  it('accepts simple addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('foo.bar+x@example.com')).toBe(true);
  });
  it('rejects malformed', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.co')).toBe(false);
    expect(isValidEmail('@b.co')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('accepts >= 8 chars', () => {
    expect(isValidPassword('hunter22')).toBe(true);
    expect(isValidPassword('x'.repeat(8))).toBe(true);
  });
  it('rejects too short', () => {
    expect(isValidPassword('')).toBe(false);
    expect(isValidPassword('short7!')).toBe(false);
  });
  it('rejects too long', () => {
    expect(isValidPassword('x'.repeat(257))).toBe(false);
  });
});

describe('isValidDisplayName', () => {
  it('accepts alnum + _ + -, 3-32 chars', () => {
    expect(isValidDisplayName('abc')).toBe(true);
    expect(isValidDisplayName('A_b-9')).toBe(true);
    expect(isValidDisplayName('x'.repeat(32))).toBe(true);
  });
  it('rejects too short / too long / bad chars', () => {
    expect(isValidDisplayName('ab')).toBe(false);
    expect(isValidDisplayName('x'.repeat(33))).toBe(false);
    expect(isValidDisplayName('has space')).toBe(false);
    expect(isValidDisplayName('dots.bad')).toBe(false);
    expect(isValidDisplayName('emoji😀')).toBe(false);
  });
});

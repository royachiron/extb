import { describe, it, expect } from 'vitest';
import { isHiddenRoom } from './access';
import type { User, Room } from './types';

const member: User = { id: 5, access_level: 'full', is_banned: 0, email_verified: 1, is_approved: 1 } as User;
const mod: User = { id: 9, access_level: 'mod', is_banned: 0, email_verified: 1, is_approved: 1 } as User;

function room(over: Partial<Room>): Room {
  return { id: 22, slug: 'success', is_exclusive: 0, is_locked: 0, min_read: 'full', ...over } as Room;
}

describe('isHiddenRoom', () => {
  it('hides exclusive room from a non-granted member', () => {
    expect(isHiddenRoom(member, room({ is_exclusive: 1 }))).toBe(true);
  });
  it('shows exclusive room to a granted member', () => {
    expect(isHiddenRoom(member, room({ is_exclusive: 1, user_permission: 'full' }))).toBe(false);
  });
  it('shows exclusive room to a mod', () => {
    expect(isHiddenRoom(mod, room({ is_exclusive: 1 }))).toBe(false);
  });
  it('never hides a non-exclusive room', () => {
    expect(isHiddenRoom(member, room({ is_exclusive: 0 }))).toBe(false);
  });
  it('hides exclusive room from anon', () => {
    expect(isHiddenRoom(null, room({ is_exclusive: 1 }))).toBe(true);
  });
});

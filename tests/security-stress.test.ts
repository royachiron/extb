import { describe, it, expect } from 'vitest';
import { canRead, canPost, isMod } from '../src/access';
import type { User, Room } from '../src/types';

const u = (over: Partial<User> = {}): User => ({
  id: 1,
  email: 'a@b.c',
  display_name: 'a',
  password_hash: '',
  bio: null,
  avatar_color: '#000',
  access_level: 'member',
  email_verified: 1, is_approved: 1,
  is_adult: 1,
  is_banned: 0,
  mod_note: null,
  timezone: 'UTC',
  pronouns: null,
  twitter_url: null,
  website_url: null,
  signature: null,
  cover_image: null,
  hide_activity: 0,
  hide_bio: 0,
  show_nsfw: 0,
  chat_icon: null,
  last_icon_change: null,
  created_at: '',
  require_review: 0,
  delete_on_approve: 0,
  ...over,
});

const anonRoom: Room = {
  id: 1,
  name: 'Q',
  slug: 'q',
  description: '',
  icon: null,
  kind: 'questions',
  min_read: 'anon',
  min_post: 'member',
  sort_order: 0,
  is_locked: 0,
  is_exclusive: 0,
  is_page: 1,
};

const fullRoom: Room = {
  ...anonRoom,
  id: 3,
  slug: 'projects',
  min_read: 'full',
  min_post: 'full',
  is_locked: 1,
  is_page: 0,
};

describe('Security Stress Test: Auth Gates', () => {
  it('TEST-8: Auth Gate Bypass - Banned admin cannot access anon room', () => {
    const bannedAdmin = u({ is_banned: 1, access_level: 'admin' });
    expect(canRead(bannedAdmin, anonRoom)).toBe(false);
  });

  it('TEST-9: Membership Admission - Unapproved user cannot post', () => {
    const unverifiedUser = u({ email_verified: 0, is_approved: 0 });
    expect(canPost(unverifiedUser, anonRoom)).toBe(false);
  });

  it('TEST-2: IDOR Simulation - Member cannot post in mod-only gated room (implicitly)', () => {
    const modRoom: Room = { ...fullRoom, min_post: 'mod' };
    const normalUser = u({ access_level: 'full' });
    // In our system 'mod' gate only allows mod/admin
    expect(canPost(normalUser, modRoom)).toBe(false);
  });
});

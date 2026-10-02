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
  slug: 'a',
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
const memRoom: Room = {
  ...anonRoom,
  id: 2,
  slug: 'bid',
  kind: 'forum',
  min_read: 'member',
  min_post: 'member',
  is_page: 0,
};
const fullRoom: Room = {
  ...memRoom,
  id: 3,
  slug: 'projects',
  min_read: 'full',
  min_post: 'full',
  is_locked: 1,
};

describe('canRead', () => {
  it('anon can read anon room', () => expect(canRead(null, anonRoom)).toBe(true));
  it('anon cannot read member room', () => expect(canRead(null, memRoom)).toBe(false));
  it('member cannot read locked full room', () =>
    expect(canRead(u(), fullRoom)).toBe(false));
  it('full can read full room', () =>
    expect(canRead(u({ access_level: 'full' }), fullRoom)).toBe(true));
  it('mod can read anything', () =>
    expect(canRead(u({ access_level: 'mod' }), fullRoom)).toBe(true));
  it('banned cannot read anything', () =>
    expect(canRead(u({ is_banned: 1, access_level: 'admin' }), anonRoom)).toBe(false));
});

describe('canPost', () => {
  it('anon cannot post forum', () => expect(canPost(null, memRoom)).toBe(false));
  it('unapproved member cannot post', () =>
    expect(canPost(u({ email_verified: 0, is_approved: 0 }), memRoom)).toBe(false));
  it('member can post member room', () => expect(canPost(u(), memRoom)).toBe(true));
  it('member cannot post locked', () => expect(canPost(u(), fullRoom)).toBe(false));
  it('full can post full room', () =>
    expect(canPost(u({ access_level: 'full' }), fullRoom)).toBe(true));
  it('mod can post anywhere', () =>
    expect(canPost(u({ access_level: 'mod' }), fullRoom)).toBe(true));
  it('banned cannot post', () =>
    expect(canPost(u({ is_banned: 1, access_level: 'full' }), memRoom)).toBe(false));
});

describe('isMod', () => {
  it('member not mod', () => expect(isMod(u())).toBe(false));
  it('mod is mod', () => expect(isMod(u({ access_level: 'mod' }))).toBe(true));
  it('admin is mod', () => expect(isMod(u({ access_level: 'admin' }))).toBe(true));
  it('banned mod is not mod', () =>
    expect(isMod(u({ access_level: 'mod', is_banned: 1 }))).toBe(false));
});

describe('user_permission overrides - canRead', () => {
  it('blocked prevents read even in open room', () =>
    expect(canRead(u(), { ...memRoom, user_permission: 'blocked' })).toBe(false));
  it('read grants access', () =>
    expect(canRead(u(), { ...memRoom, user_permission: 'read' })).toBe(true));
  it('full grants read access', () =>
    expect(canRead(u(), { ...memRoom, user_permission: 'full' })).toBe(true));
  it('mod bypasses blocked override', () =>
    expect(canRead(u({ access_level: 'mod' }), { ...memRoom, user_permission: 'blocked' })).toBe(true));
  it('banned user is blocked even with read permission', () =>
    expect(canRead(u({ is_banned: 1 }), { ...memRoom, user_permission: 'read' })).toBe(false));
});

describe('user_permission overrides - canPost', () => {
  it('blocked prevents posting', () =>
    expect(canPost(u(), { ...memRoom, user_permission: 'blocked' })).toBe(false));
  it('read is read-only - prevents posting', () =>
    expect(canPost(u(), { ...memRoom, user_permission: 'read' })).toBe(false));
  it('full allows posting', () =>
    expect(canPost(u(), { ...memRoom, user_permission: 'full' })).toBe(true));
  it('mod bypasses blocked override', () =>
    expect(canPost(u({ access_level: 'mod' }), { ...memRoom, user_permission: 'blocked' })).toBe(true));
});

describe('exclusive room', () => {
  const excRoom: Room = { ...memRoom, id: 4, slug: 'excl', is_exclusive: 1 };

  it('member without explicit permission cannot read', () =>
    expect(canRead(u(), excRoom)).toBe(false));
  it('anon without explicit permission cannot read', () =>
    expect(canRead(null, excRoom)).toBe(false));
  it('read permission grants read', () =>
    expect(canRead(u(), { ...excRoom, user_permission: 'read' })).toBe(true));
  it('full permission grants read', () =>
    expect(canRead(u(), { ...excRoom, user_permission: 'full' })).toBe(true));
  it('member without explicit permission cannot post', () =>
    expect(canPost(u(), excRoom)).toBe(false));
  it('read permission does not allow posting', () =>
    expect(canPost(u(), { ...excRoom, user_permission: 'read' })).toBe(false));
  it('full permission allows posting', () =>
    expect(canPost(u(), { ...excRoom, user_permission: 'full' })).toBe(true));
  it('mod can read without explicit permission', () =>
    expect(canRead(u({ access_level: 'mod' }), excRoom)).toBe(true));
  it('mod can post without explicit permission', () =>
    expect(canPost(u({ access_level: 'mod' }), excRoom)).toBe(true));
});

describe('backward compat - legacy allow/deny values', () => {
  it('allow acts as full for canRead', () =>
    expect(canRead(u(), { ...memRoom, user_permission: 'allow' as any })).toBe(true));
  it('deny acts as blocked for canRead', () =>
    expect(canRead(u(), { ...memRoom, user_permission: 'deny' as any })).toBe(false));
  it('allow acts as full for canPost', () =>
    expect(canPost(u(), { ...memRoom, user_permission: 'allow' as any })).toBe(true));
  it('deny acts as blocked for canPost', () =>
    expect(canPost(u(), { ...memRoom, user_permission: 'deny' as any })).toBe(false));
});

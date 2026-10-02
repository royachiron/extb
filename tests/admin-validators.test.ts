import { describe, it, expect } from 'vitest';
import { isValidSlug, isValidRoomKind, isValidAccessLevel, isValidMinPostGate, isValidMinReadGate, normalizeAdminLocation } from '../src/api/admin';
import { renderAdmin } from '../src/views/admin';

describe('isValidSlug', () => {
  it('accepts lowercase alphanumeric and hyphens, 2-32 chars', () => {
    expect(isValidSlug('bid')).toBe(true);
    expect(isValidSlug('off-topic')).toBe(true);
    expect(isValidSlug('r1')).toBe(true);
    expect(isValidSlug('a'.repeat(32))).toBe(true);
    expect(isValidSlug('a'.repeat(2))).toBe(true);
  });

  it('rejects too short / too long', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
  });

  it('rejects uppercase, underscores, spaces, slashes, unicode', () => {
    expect(isValidSlug('Bid')).toBe(false);
    expect(isValidSlug('off_topic')).toBe(false);
    expect(isValidSlug('off topic')).toBe(false);
    expect(isValidSlug('r/bid')).toBe(false);
    expect(isValidSlug('café')).toBe(false);
    expect(isValidSlug('-bad')).toBe(true); // hyphens at edges allowed by regex; intentional
  });

  it('rejects empty / whitespace only', () => {
    expect(isValidSlug('   ')).toBe(false);
    expect(isValidSlug('\n')).toBe(false);
  });
});

describe('isValidRoomKind', () => {
  it('accepts every real room kind including chat', () => {
    for (const k of ['forum', 'blog', 'news', 'questions', 'chat']) {
      expect(isValidRoomKind(k)).toBe(true);
    }
  });

  it('rejects unknown / empty kinds', () => {
    expect(isValidRoomKind('dm')).toBe(false);
    expect(isValidRoomKind('')).toBe(false);
    expect(isValidRoomKind('Chat')).toBe(false);
  });
});

describe('access model validators', () => {
  it('keeps club as a user capability, not a room gate or role', () => {
    expect(isValidAccessLevel('club')).toBe(false);
    expect(isValidMinReadGate('club')).toBe(false);
    expect(isValidMinPostGate('club')).toBe(false);

    expect(isValidAccessLevel('full')).toBe(true);
    expect(isValidMinReadGate('full')).toBe(true);
    expect(isValidMinPostGate('full')).toBe(true);
  });
});

describe('normalizeAdminLocation', () => {
  it('maps rooms/access/settings legacy pages into grouped sections', () => {
    expect(normalizeAdminLocation('rooms', null)).toEqual({ section: 'spaces', tab: 'rooms' });
    expect(normalizeAdminLocation('access', null)).toEqual({ section: 'spaces', tab: 'access' });
    expect(normalizeAdminLocation('settings', null)).toEqual({ section: 'system', tab: 'settings' });
  });
});

describe('admin settings rendering', () => {
  const baseOpts = {
    user: { id: 1, display_name: 'Admin', email: 'admin@example.com', access_level: 'admin' },
    rooms: [],
    allRooms: [],
    settings: [
      { key: 'seeded', value: 'true' },
      { key: 'signups_open', value: '0' },
      { key: 'iron_gate_active', value: '1' },
    ],
    users: [],
    csrfToken: 'csrf',
  } as any;

  it('does not expose seeded or raw add-setting controls in advanced settings', () => {
    const html = renderAdmin({ ...baseOpts, section: 'system', tab: 'settings' });

    expect(html).not.toContain('seeded');
    expect(html).not.toContain('Add New Setting');
    expect(html).not.toContain('chat_auth_secret');
  });

  it('renders neutral branding and administrative links', () => {
    const html = renderAdmin({ ...baseOpts, section: 'system', tab: 'settings' });
    expect(html).toContain('Community branding');
    expect(html).toContain('/admin/invitations');
    expect(html).toContain('/admin/tokens');
    expect(html).not.toContain('Iron gate');
  });
});

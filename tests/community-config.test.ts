import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMBERSHIP_CONFIG, membershipConfigFromSettings, applicationRoomEligible, staffContactEligible, welcomeSenderEligible } from '../src/lib/membership-config';
import { getBotBranch, botCommandBranch, helperConfigFromSettings } from '../src/lib/bot-copy';
import { renderSettings } from '../src/views/admin/settings';
import { renderBotPanel } from '../src/views/bot';
import type { Room, User } from '../src/types';

const room = { kind: 'forum', is_exclusive: 0, is_locked: 0, is_page: 0, min_read: 'member', min_post: 'member' } as Room;
const staff = { access_level: 'mod', is_approved: 1, is_banned: 0, display_name: 'Staff', email_verified: 1 } as User;
describe('community configuration', () => {
  it('fails safely on malformed and untyped saved gate settings', () => {
    expect(membershipConfigFromSettings([])).toEqual(DEFAULT_MEMBERSHIP_CONFIG);
    expect(membershipConfigFromSettings([{ key: 'membership_config', value: '{' }])).toEqual(DEFAULT_MEMBERSHIP_CONFIG);
    expect(membershipConfigFromSettings([{ key: 'membership_config', value: '{"enabled":"false","staffUserId":-1,"applicationRoomId":1.2}' }])).toEqual(DEFAULT_MEMBERSHIP_CONFIG);
  });
  it('requires a forum writable by ordinary approved members', () => {
    expect(applicationRoomEligible(room)).toBe(true);
    for (const override of [{ is_archived: 1 }, { is_exclusive: 1 }, { is_locked: 1 }, { min_read: 'full' }, { min_post: 'full' }, { kind: 'chat' }, { is_page: 1 }]) expect(applicationRoomEligible({ ...room, ...override } as Room)).toBe(false);
  });
  it('requires active named staff for private contact', () => {
    expect(staffContactEligible(staff)).toBe(true);
    for (const override of [{ is_banned: 1 }, { is_approved: 0 }, { display_name: null }, { access_level: 'member' }, { allow_dms: 0 }]) expect(staffContactEligible({ ...staff, ...override } as User)).toBe(false);
  });
  it('allows configured ordinary welcome senders, but rejects suspended or restricted senders', () => {
    expect(welcomeSenderEligible({ ...staff, access_level: 'member' })).toBe(true);
    expect(welcomeSenderEligible({ ...staff, posting_restricted_at: '2026-10-04' })).toBe(false);
    expect(welcomeSenderEligible({ ...staff, intake_status: 'pending' } as User)).toBe(false);
  });
});
describe('optional general helper', () => {
  it('offers helper enable controls even when the setting is absent', () => {
    const html = renderSettings({ settings: [] });
    expect(html).toContain('name="key" value="bot_enabled"');
    expect(html).toContain('name="value" value="1"');
  });
  it('implements all commands including help, room and quiet', () => {
    for (const cmd of ['intro', 'topic', 'reply', 'room', 'quiet', 'help']) expect(getBotBranch(botCommandBranch('/bot ' + cmd)).id).toBe(cmd);
    expect(getBotBranch(botCommandBranch('/bot unknown')).id).toBe('help');
  });
  it('escapes editable guidance and names without hardcoded room links', () => {
    const config = helperConfigFromSettings([{ key: 'helper_config', value: JSON.stringify({ name: '<img src=x>', intro: '<script>alert(1)</script>' }) }]);
    const html = renderBotPanel('intro', { variant: 'page', botName: config.name, guidance: config });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('/post?room=introductions');
  });
  it('offers Hebrew defaults and only supplied readable room links', () => {
    expect(getBotBranch('quiet', undefined, 'he').title).toContain('לומר');
    const html = renderBotPanel('room', { variant: 'page', botName: 'Helper', rooms: [{ id: 1, slug: 'public', name: 'Public' }] as Room[] });
    expect(html).toContain('/r/public');
    expect(html).not.toContain('secret');
  });
});

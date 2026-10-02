import { describe, it, expect } from 'vitest';
import {
  chatParseCommand, chatMeRest, chatActionBody, chatIsMention, chatMarkMention, chatNick, chatBubble,
} from '../src/views/chat-message';
import { renderChatUserMenu } from '../src/views/chat-user-menu';
import { renderChat } from '../src/views/chat';
import type { User } from '../src/types';

describe('chatParseCommand', () => {
  it('parses a command with and without an argument', () => {
    expect(chatParseCommand('/me waves')).toEqual({ name: 'me', arg: 'waves' });
    expect(chatParseCommand('/clear')).toEqual({ name: 'clear', arg: '' });
    expect(chatParseCommand('/MSG  bob hi')).toEqual({ name: 'msg', arg: 'bob hi' });
  });
  it('does NOT treat paths, links or a bare slash as commands', () => {
    expect(chatParseCommand('/r/coping is nice')).toBeNull();
    expect(chatParseCommand('/ hi')).toBeNull();
    expect(chatParseCommand('/')).toBeNull();
    expect(chatParseCommand('hello /me')).toBeNull();
  });
});

describe('/me action lines', () => {
  it('extracts the action text only for "/me <text>"', () => {
    expect(chatMeRest('/me waves')).toBe('waves');
    expect(chatMeRest('/me')).toBeNull();
    expect(chatMeRest('/meow')).toBeNull();
    expect(chatMeRest('hi')).toBeNull();
  });
  it('builds an action body from pre-escaped parts', () => {
    expect(chatActionBody('sam', 'waves')).toBe('<em class="chat-action">* sam waves</em>');
  });
});

describe('mentions', () => {
  it('detects @me case-insensitively, never on my own lines', () => {
    expect(chatIsMention('hey @Phantom look', 'Phantom', 'maren')).toBe(true);
    expect(chatIsMention('hey @alex', 'Alex', 'maren')).toBe(true);
    expect(chatIsMention('hey @Phantom', 'Phantom', 'Phantom')).toBe(false);
    expect(chatIsMention('hey Phantom', 'Phantom', 'maren')).toBe(false);
    expect(chatIsMention('@x', '', 'maren')).toBe(false);
  });
  it('tags only the bubble root', () => {
    const b = chatBubble({ id: 1, isMe: false, headerHtml: '', quoteHtml: '', bodyHtml: '', reactionsHtml: '' });
    const m = chatMarkMention(b);
    expect(m.startsWith('<div class="chat-message chat-mention"')).toBe(true);
    expect(m.split('chat-mention').length).toBe(2);
  });
});

describe('chatNick', () => {
  it('emits a button keyed by the pre-escaped name', () => {
    expect(chatNick('a&amp;b')).toBe('<button type="button" class="chat-nick" data-nick="a&amp;b">a&amp;b</button>');
  });
});

describe('renderChatUserMenu', () => {
  const base = {
    id: 1, email: 'v@x.y', display_name: 'viewer', access_level: 'full', avatar_color: '#123456',
    created_at: '2026-06-01 10:00:00', allow_dms: 1, is_banned: 0,
  } as unknown as User;
  const target = { ...base, id: 2, display_name: '<b>evil</b>', allow_dms: 1 } as unknown as User;
  const mod = { ...base, id: 3, access_level: 'mod' } as unknown as User;

  it('escapes the target name everywhere', () => {
    const html = renderChatUserMenu({ target, badges: [], viewer: base, viewerIsMod: false, blocked: false });
    expect(html).not.toContain('<b>evil</b>');
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;');
  });

  it('shows member actions, hides mod actions for members', () => {
    const html = renderChatUserMenu({ target, badges: [], viewer: base, viewerIsMod: false, blocked: false });
    for (const act of ['data-nick-act="mention"', 'data-nick-act="ignore"', 'data-nick-act="block"', '/report/form?type=user&id=2', '/dms/']) {
      expect(html).toContain(act);
    }
    expect(html).not.toContain('data-nick-act="purge"');
    expect(html).not.toContain('section=users');
  });

  it('adds the moderator section for mods', () => {
    const html = renderChatUserMenu({ target, badges: [], viewer: mod, viewerIsMod: true, blocked: false });
    expect(html).toContain('data-nick-act="purge"');
    expect(html).toContain('/admin?section=users&amp;status=all&amp;q=');
  });

  it('blocked: offers Unblock and no DM', () => {
    const html = renderChatUserMenu({ target, badges: [], viewer: base, viewerIsMod: false, blocked: true });
    expect(html).toContain('data-blocked="1"');
    expect(html).toContain('Unblock');
    expect(html).not.toContain('href="/dms/');
  });

  it('no DM when the target turned DMs off (unless viewer is admin)', () => {
    const closed = { ...target, allow_dms: 0 } as unknown as User;
    expect(renderChatUserMenu({ target: closed, badges: [], viewer: base, viewerIsMod: false, blocked: false })).not.toContain('href="/dms/');
    const admin = { ...base, access_level: 'admin' } as unknown as User;
    expect(renderChatUserMenu({ target: closed, badges: [], viewer: admin, viewerIsMod: true, blocked: false })).toContain('href="/dms/');
  });

  it('own card: profile only, no actions against yourself', () => {
    const html = renderChatUserMenu({ target: base, badges: [], viewer: base, viewerIsMod: false, blocked: false });
    expect(html).toContain('View profile');
    expect(html).not.toContain('data-nick-act="block"');
    expect(html).not.toContain('data-nick-act="ignore"');
  });

  it('renders neutral community badges', () => {
    const badges = [
      { id: 1, name: 'Founding member', icon: '', color: '#f5c5ac', shape: 'pill', description: '', status: 'have' },
      { id: 2, name: 'Builder', icon: '', color: '#d7f1b0', shape: 'pill', description: '', status: 'need' },
    ] as any;
    const html = renderChatUserMenu({ target, badges, viewer: base, viewerIsMod: false, blocked: false });
    expect(html).toContain('>Badges<');
    expect(html).not.toContain('>Have<');
    expect(html).not.toContain('>Need<');
    expect(html).toContain('Founding member');
    expect(html).toContain('Builder');
  });

  it('is a fragment: no script or style tags', () => {
    const html = renderChatUserMenu({ target, badges: [], viewer: mod, viewerIsMod: true, blocked: false });
    expect(html).not.toMatch(/<script|<style/);
  });
});

describe('chat page wiring', () => {
  const user = { id: 1, email: 'a@b.c', display_name: 'tester', access_level: 'full', email_verified: 1, is_approved: 1 } as unknown as User;
  const html = renderChat({ user, csrfToken: 'tok', rooms: [], activeSlug: 'chat' });
  it('ships the menu, hints and command helpers', () => {
    for (const s of ['id="chat-nick-menu"', 'id="chat-hints"', 'var chatParseCommand = ', 'var chatNick = ', 'function openMenu(', 'function runLocalCommand(', "'/chat/user/'"]) {
      expect(html).toContain(s);
    }
  });
});

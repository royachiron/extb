import { describe, it, expect } from 'vitest';
import { chatDockRooms, renderChatDock, CHAT_DOCK_BOOT, CHAT_DOCK_SCRIPT } from '../src/views/chat-dock';
import { renderLayout } from '../src/views/layout';
import type { User, Room } from '../src/types';

const room = (o: Partial<Room> & { slug: string }) => ({
  id: 1, name: o.slug, kind: 'forum', min_read: 'member', min_post: 'member',
  is_locked: 0, is_exclusive: 0, is_page: 0, is_archived: 0, description: '', icon: null, ...o,
}) as unknown as Room;
const rooms = [
  room({ id: 1, slug: 'coping' }),
  room({ id: 10, slug: 'chat', name: 'General', kind: 'chat', is_page: 1 } as any),
  room({ id: 11, slug: 'club-lounge', name: 'Club Lounge', kind: 'chat', is_page: 1, min_read: 'full' } as any),
];
const member = {
  id: 1, email: 'a@b.c', display_name: 'tester', access_level: 'member', email_verified: 1, is_approved: 1, is_banned: 0,
  tos_version: 999, password_salt: 'x', show_nsfw: 0,
} as unknown as User;
const full = { ...member, access_level: 'full' } as unknown as User;

describe('chatDockRooms (who gets the dock)', () => {
  it('nobody for guests, unapproved or banned users', () => {
    expect(chatDockRooms(null, rooms)).toEqual([]);
    expect(chatDockRooms({ ...member, is_approved: 0 } as any, rooms)).toEqual([]);
    expect(chatDockRooms({ ...member, is_banned: 1 } as any, rooms)).toEqual([]);
  });
  it('only chat rooms the user can read', () => {
    expect(chatDockRooms(member, rooms).map(r => r.slug)).toEqual(['chat']);
    expect(chatDockRooms(full, rooms).map(r => r.slug)).toEqual(['chat', 'club-lounge']);
  });
});

describe('dock in the page shell', () => {
  const page = (u: User | null, extra: Record<string, unknown> = {}) =>
    renderLayout({ user: u, rooms, title: 't', body: '<p>body</p>', csrfToken: 'tok', ...extra } as any);

  it('approved members get the dock, outside .main, plus boot + controller', () => {
    const html = page(full);
    const mainEnd = html.indexOf('</main>');
    const dockAt = html.indexOf('<aside id="chat-dock"');
    expect(dockAt).toBeGreaterThan(mainEnd);
    expect(html).toContain("document.body.classList.add('has-chat-dock')");
    expect(html).toContain('window.__chatDock =');
    expect(html).toContain('data-chat-room="club-lounge"');
    expect(html).toContain('data-dock="1"');
  });

  it('guests and unapproved users get no dock and no dock script', () => {
    for (const html of [page(null), page({ ...member, is_approved: 0 } as any)]) {
      expect(html).not.toContain('id="chat-dock"');
      expect(html).not.toContain('__chatDock');
      expect(html).not.toContain('chat-open');
      expect(html).not.toContain('class="chat-dock-tab"');
      expect(html).not.toContain('class="chat-dock-resize"');
    }
  });

  it('dock users get the drag divider (inside the dock) and the edge tab (outside the grid)', () => {
    const html = page(full);
    const dockAt = html.indexOf('<aside id="chat-dock"');
    const dockEnd = html.indexOf('</aside>', html.indexOf('class="chat-users"'));
    const divider = html.indexOf('class="chat-dock-resize"');
    expect(divider).toBeGreaterThan(dockAt);
    expect(divider).toBeLessThan(dockEnd);
    expect(html).toContain('role="separator"');
    const layoutEnd = html.indexOf('</div>', html.indexOf('</aside>', dockEnd));
    const tab = html.indexOf('class="chat-dock-tab"');
    expect(tab).toBeGreaterThan(layoutEnd);
    expect(html.slice(tab, tab + 600)).toContain('class="js-chat-badge"');
  });

  it('phone: floating window opened from a chat button, size button cycles', () => {
    const html = page(full);
    expect(html).toContain('--chat-win-h: 380px;');
    // starts closed unless the viewer left it open
    expect(CHAT_DOCK_BOOT).toContain("m === 'default' || m === 'large'");
    // chat button outside the grid, with the unread badge
    const fab = html.indexOf('class="chat-fab"');
    expect(fab).toBeGreaterThan(html.indexOf('</main>'));
    expect(html.slice(fab, fab + 600)).toContain('class="js-chat-badge"');
    // one size button in the window header
    expect(html).toContain('data-chat-dock-cycle');
    expect(html).not.toContain('data-chat-dock-mini');
    expect(CHAT_DOCK_SCRIPT).toContain('function phoneCycle(');
    // the tab bar is never moved by the chat
    expect(html).not.toMatch(/chat-dock[^{]*\.bottom-nav\s*\{/);
  });

  it('guests get no chat button', () => {
    expect(page(null)).not.toContain('class="chat-fab"');
  });

  it('width tokens: 25vw default, clamped column', () => {
    const html = page(full);
    expect(html).toContain('--chat-dock-pct: 25vw;');
    expect(html).toContain('--chat-dock-w: clamp(280px, var(--chat-dock-pct), calc(100vw - 720px));');
    expect(CHAT_DOCK_BOOT).toContain("localStorage.getItem('chat_dock_pct')");
  });

  it('openChatDock marks the body so the dock opens on load', () => {
    expect(page(full, { openChatDock: '' })).toContain('data-chat-open=""');
    expect(page(full, { openChatDock: 'club-lounge' })).toContain('data-chat-open="club-lounge"');
    expect(page(full)).not.toContain('data-chat-open');
  });

  it('the dock chat never locks page scroll (only the /chat page variant does)', () => {
    const html = page(full);
    expect(html).toContain('body:has(.chat-wrap:not(.chat-wrap--dock))');
    expect(html).not.toMatch(/body:has\(\.chat-wrap\)/);
  });

  it('every inline script on a docked page parses', () => {
    const scripts = [...page(full).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!);
    expect(scripts.length).toBeGreaterThan(3);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });

  it('dock scripts parse on their own', () => {
    expect(() => new Function(CHAT_DOCK_BOOT)).not.toThrow();
    expect(() => new Function(CHAT_DOCK_SCRIPT)).not.toThrow();
  });

  it('defaults to the General room when readable', () => {
    expect(renderChatDock({ user: full, chatRooms: chatDockRooms(full, rooms), csrfToken: 't' })).toContain('data-room="chat"');
    const onlyClub = [rooms[2]!];
    expect(renderChatDock({ user: full, chatRooms: onlyClub, csrfToken: 't' })).toContain('data-room="club-lounge"');
  });
});

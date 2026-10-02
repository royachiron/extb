import { describe, it, expect } from 'vitest';
import { groupReactionsByPost } from '../src/db';
import { collectRecipients, buildNotificationContent } from '../src/api/notifications';
import { isCacheableGuestRequest } from '../src/cache';
import { renderDmBadge } from '../src/api/dms';
import { renderChatBadge, renderHeartbeat } from '../src/api/heartbeat';
import { renderNotificationBadge } from '../src/views/notifications';

describe('groupReactionsByPost', () => {
  it('returns an empty map for no rows', () => {
    expect(groupReactionsByPost([])).toEqual(new Map());
  });

  it('groups rows by post_id, dropping post_id from each entry', () => {
    const rows = [
      { post_id: 1, emoji: '👍', count: 2, users: 'Alice,Bob' },
      { post_id: 1, emoji: '❤️', count: 1, users: 'Carol' },
      { post_id: 2, emoji: '👍', count: 1, users: 'Alice' },
    ];
    const out = groupReactionsByPost(rows);
    expect(out.get(1)).toEqual([
      { emoji: '👍', count: 2, users: 'Alice,Bob' },
      { emoji: '❤️', count: 1, users: 'Carol' },
    ]);
    expect(out.get(2)).toEqual([{ emoji: '👍', count: 1, users: 'Alice' }]);
  });

  it('has no entry for a post with no reactions', () => {
    const out = groupReactionsByPost([{ post_id: 5, emoji: '👍', count: 1, users: 'Alice' }]);
    expect(out.has(99)).toBe(false);
  });

  it('passes a null users value through untouched', () => {
    const out = groupReactionsByPost([{ post_id: 1, emoji: '👍', count: 0, users: null }]);
    expect(out.get(1)).toEqual([{ emoji: '👍', count: 0, users: null }]);
  });

  it('preserves row order within a post when post_ids are interleaved', () => {
    const rows = [
      { post_id: 1, emoji: '👍', count: 1, users: 'Alice' },
      { post_id: 2, emoji: '❤️', count: 1, users: 'Bob' },
      { post_id: 1, emoji: '🎉', count: 1, users: 'Carol' },
    ];
    const out = groupReactionsByPost(rows);
    expect(out.get(1)).toEqual([
      { emoji: '👍', count: 1, users: 'Alice' },
      { emoji: '🎉', count: 1, users: 'Carol' },
    ]);
    expect(out.get(2)).toEqual([{ emoji: '❤️', count: 1, users: 'Bob' }]);
  });
});

describe('collectRecipients', () => {
  it('returns nothing when only the post author is involved', () => {
    expect(collectRecipients([], [], 7, 7)).toEqual([]);
  });

  it('notifies mentioned users as "mention"', () => {
    expect(collectRecipients([2, 3], [], null, 1)).toEqual([
      { userId: 2, type: 'mention' },
      { userId: 3, type: 'mention' },
    ]);
  });

  it('notifies followers and the topic author as "reply"', () => {
    expect(collectRecipients([], [4], 5, 1)).toEqual([
      { userId: 4, type: 'reply' },
      { userId: 5, type: 'reply' },
    ]);
  });

  it('never notifies the post author, even if mentioned or following', () => {
    expect(collectRecipients([1], [1], 1, 1)).toEqual([]);
  });

  it('deduplicates: a mentioned follower is notified once, as a mention', () => {
    expect(collectRecipients([2], [2], null, 1)).toEqual([{ userId: 2, type: 'mention' }]);
  });

  it('does not duplicate the topic author when already a follower', () => {
    expect(collectRecipients([], [9], 9, 1)).toEqual([{ userId: 9, type: 'reply' }]);
  });
});

describe('buildNotificationContent', () => {
  it('builds a mention string', () => {
    expect(buildNotificationContent('Alice', 'mention', 'Hello')).toBe('Alice mentioned you in "Hello"');
  });
  it('builds a reply string', () => {
    expect(buildNotificationContent('Bob', 'reply', 'Hello')).toBe('Bob replied to "Hello"');
  });
});

describe('isCacheableGuestRequest', () => {
  const mk = (url: string, init?: RequestInit) => new Request(url, init);

  it('does NOT cache the root path because guests redirect through CSRF-bearing pages', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/'))).toBe(false);
  });

  it('does NOT cache guest topic pages because they can contain CSRF reply forms', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/t/abc123'))).toBe(false);
  });

  it('does NOT cache guest room pages because they can contain CSRF posting forms', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/r/general'))).toBe(false);
  });

  it('caches a guest GET of the /forum path', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/forum'))).toBe(true);
  });

  it('does NOT cache guest about pages because layout/static pages can contain CSRF forms', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/about/what-is-bid'))).toBe(false);
  });

  it('does NOT cache a non-GET request', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/', { method: 'POST' }))).toBe(false);
  });

  it('does NOT cache when a session cookie is present', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/', {
      headers: { cookie: 'csrf=x; session=abc' },
    }))).toBe(false);
  });

  it('caches an allowlisted path when only a csrf cookie is present (no session)', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/', {
      headers: { cookie: 'csrf=x' },
    }))).toBe(false);
    expect(isCacheableGuestRequest(mk('https://extb.test/forum', {
      headers: { cookie: 'csrf=x' },
    }))).toBe(true);
  });

  it('does NOT cache an HTMX partial request', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/', {
      headers: { 'hx-request': 'true' },
    }))).toBe(false);
  });

  it('does NOT cache a non-allowlisted path', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/login'))).toBe(false);
    expect(isCacheableGuestRequest(mk('https://extb.test/dms'))).toBe(false);
    expect(isCacheableGuestRequest(mk('https://extb.test/admin'))).toBe(false);
  });

  it('does NOT cache a thread sub-route like /t/:id/edit', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/t/abc123/edit'))).toBe(false);
  });

  it('does NOT cache a guest topic path with a trailing slash', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/t/abc123/'))).toBe(false);
  });

  it('treats an empty session cookie value as guest for allowlisted paths', () => {
    expect(isCacheableGuestRequest(mk('https://extb.test/forum', {
      headers: { cookie: 'session=' },
    }))).toBe(true);
  });

  it('caches an allowlisted path carrying a query string', () => {
    // The query string is part of the cache key (see isCacheableGuestRequest
    // doc) - eligibility is decided by pathname, so this is cacheable.
    expect(isCacheableGuestRequest(mk('https://extb.test/forum?room=foo'))).toBe(true);
  });
});

describe('renderDmBadge', () => {
  it('renders nothing for zero unread', () => {
    expect(renderDmBadge(0)).toBe('');
  });

  it('renders nothing for a negative count', () => {
    expect(renderDmBadge(-3)).toBe('');
  });

  it('renders the exact count from 1 to 9', () => {
    expect(renderDmBadge(1)).toBe('<span class="dm-nav-badge">1</span>');
    expect(renderDmBadge(9)).toBe('<span class="dm-nav-badge">9</span>');
  });

  it('caps counts above 9 at "9+"', () => {
    expect(renderDmBadge(10)).toBe('<span class="dm-nav-badge">9+</span>');
    expect(renderDmBadge(250)).toBe('<span class="dm-nav-badge">9+</span>');
  });
});

describe('renderChatBadge', () => {
  it('renders nothing when there is no unseen chat activity', () => {
    expect(renderChatBadge(false)).toBe('');
  });

  it('renders a bare dot marker when there is activity', () => {
    // 8d6f690 dropped the "!" text - badge is a pure CSS dot now.
    expect(renderChatBadge(true)).toBe('<span class="chat-nav-badge"></span>');
  });
});

describe('renderNotificationBadge', () => {
  it('renders nothing for zero unseen', () => {
    expect(renderNotificationBadge(0)).toBe('');
  });

  it('renders nothing for a negative count', () => {
    expect(renderNotificationBadge(-2)).toBe('');
  });

  it('renders the exact count from 1 to 9', () => {
    expect(renderNotificationBadge(1)).toBe('<span class="unread-badge">1</span>');
    expect(renderNotificationBadge(9)).toBe('<span class="unread-badge">9</span>');
  });

  it('caps counts above 9 at "9+"', () => {
    expect(renderNotificationBadge(10)).toBe('<span class="unread-badge">9+</span>');
    expect(renderNotificationBadge(99)).toBe('<span class="unread-badge">9+</span>');
  });
});

describe('renderHeartbeat', () => {
  it('wraps each badge in an out-of-band span targeting its selector', () => {
    expect(renderHeartbeat('D', 'C', 'N')).toBe(
      '<span hx-swap-oob="innerHTML:.js-dm-badge">D</span>' +
        '<span hx-swap-oob="innerHTML:.js-chat-badge">C</span>' +
        '<span hx-swap-oob="innerHTML:#notification-badge-container">N</span>',
    );
  });

  it('emits empty OOB spans when every badge is empty - this clears stale badges', () => {
    expect(renderHeartbeat('', '', '')).toBe(
      '<span hx-swap-oob="innerHTML:.js-dm-badge"></span>' +
        '<span hx-swap-oob="innerHTML:.js-chat-badge"></span>' +
        '<span hx-swap-oob="innerHTML:#notification-badge-container"></span>',
    );
  });

  it('composes the real badge renderers end to end', () => {
    const body = renderHeartbeat(renderDmBadge(3), renderChatBadge(true), renderNotificationBadge(0));
    expect(body).toContain('<span hx-swap-oob="innerHTML:.js-dm-badge"><span class="dm-nav-badge">3</span></span>');
    expect(body).toContain('<span hx-swap-oob="innerHTML:.js-chat-badge"><span class="chat-nav-badge"></span></span>');
    expect(body).toContain('<span hx-swap-oob="innerHTML:#notification-badge-container"></span>');
  });
});

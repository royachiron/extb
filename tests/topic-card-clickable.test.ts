import { describe, expect, it } from 'vitest';
import { renderTopicCards } from '../src/views/feed';
import { renderLayout } from '../src/views/layout';
import type { Room, Topic } from '../src/types';

const topic = (opts: Partial<Topic> = {}): Topic => ({
  id: 1,
  short_id: 'abc123',
  room_id: 10,
  user_id: 20,
  anon_name: null,
  title: 'Clickable card title',
  content: 'Body',
  tags: 'news, updates',
  status: 'approved',
  is_pinned: 0,
  is_locked: 0,
  reply_count: 3,
  active_reply_count: 2,
  last_reply_at: '2026-05-27T10:00:00Z',
  created_at: '2026-05-27T09:00:00Z',
  updated_at: null,
  deleted_at: null,
  delete_reason: null,
  deleted_by: null,
  removed_at: null,
  removed_by: null,
  author_display_name: 'Ada',
  require_review: 0,
  delete_on_approve: 0,
  ...opts,
});

const room = (opts: Partial<Room> = {}): Room => ({
  id: 10,
  name: 'General',
  slug: 'general',
  description: null,
  icon: null,
  kind: 'forum',
  min_read: 'anon',
  min_post: 'member',
  sort_order: 1,
  is_locked: 0,
  is_exclusive: 0,
  is_page: 0,
  ...opts,
});

describe('topic cards', () => {
  it('renders the title link and nested links used by feed and room cards', () => {
    const html = renderTopicCards([topic()], null, [room()]);

    expect(html).toContain('<article class="topic-card">');
    expect(html).toContain('class="topic-title-link"');
    expect(html).toContain('href="/t/abc123"');
    expect(html).toContain('hx-get="/t/abc123"');
    expect(html).toContain('hx-target=".main"');
    expect(html).toContain('hx-push-url="true"');
    expect(html).toContain('class="author-link"');
    expect(html).toContain('href="/u/Ada"');
    expect(html).toContain('class="badge badge-primary"');
    expect(html).toContain('href="/r/general"');
    expect(html).toContain('class="tag-chip"');
    expect(html).toContain('href="/search?q=news"');
    expect(html).toContain('href="/search?q=updates"');
  });

  it('uses the stretched-link CSS without covering nested topic links', () => {
    const css = renderLayout({ user: null, title: 'Test', body: '', rooms: [] });

    expect(css).toMatch(/\.topic-card\s*\{[^}]*position:\s*relative[^}]*cursor:\s*pointer[^}]*\}/s);
    expect(css).toMatch(/\.topic-title-link::after\s*\{[^}]*content:\s*""[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*border-radius:\s*inherit[^}]*\}/s);
    expect(css).toMatch(/\.topic-card\s+\.topic-title-link:focus-visible::after\s*\{[^}]*outline:[^}]*outline-offset:[^}]*\}/s);
    expect(css).toMatch(/\.topic-card\s+\.author-link,\s*\.topic-card\s+\.badge,\s*\.topic-card\s+\.tag-chip\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2[^}]*\}/s);
  });
});

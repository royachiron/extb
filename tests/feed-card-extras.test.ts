import { describe, it, expect } from 'vitest';
import { buildFeedCardExtras, sqlNow, inList, type ExtrasPostRow } from '../src/db/feed-extras';
import { renderTopicCards, topicExcerpt, agoText, HOT_REPLIES_24H } from '../src/views/feed';
import { SCRIPT_BOOT } from '../src/views/layout-scripts/boot';
import { LAYOUT_SCRIPT } from '../src/views/layout-scripts';
import { bumpTopicView, isCountableTopicView } from '../src/db/rooms';

const NOW = new Date('2026-10-16T12:00:00Z');
const ago = (h: number) => sqlNow(new Date(NOW.getTime() - h * 3600_000));
const post = (id: number, user_id: number | null, hoursAgo: number, topic_id = 1, anon_name: string | null = null): ExtrasPostRow =>
  ({ id, topic_id, user_id, anon_name, created_at: ago(hoursAgo) });
const users = new Map([10, 11, 12, 13, 14, 99].map((id) => [id, { id, display_name: `u${id}`, avatar_url: null, avatar_color: '#123456' }]));

const build = (over: Partial<Parameters<typeof buildFeedCardExtras>[0]> = {}) =>
  buildFeedCardExtras({
    topics: [{ id: 1, user_id: 10, is_unread: 0 }],
    posts: [], users, opReactions: new Map(), replyReactions: new Map(), readMarks: new Map(),
    watermark: null, viewerId: 99, blockedIds: [], now: NOW, ...over,
  }).get(1)!;

describe('buildFeedCardExtras', () => {
  it('counts replies, 24h activity and names the newest replier (anon too)', () => {
    const x = build({ posts: [post(1, 11, 30), post(2, 12, 5), post(3, null, 1, 1, 'Ghost')] });
    expect(x.replies).toBe(3);
    expect(x.replies24h).toBe(2);
    expect(x.lastReply).toEqual({ name: 'Ghost', at: ago(1) });
  });

  it('people = up to 3 newest distinct repliers, never the author, never blocked users', () => {
    const x = build({
      posts: [post(1, 11, 9), post(2, 12, 8), post(3, 10, 7), post(4, 13, 6), post(5, 12, 5), post(6, 14, 4)],
      blockedIds: [14],
    });
    expect(x.people.map((p) => p.name)).toEqual(['u12', 'u13', 'u11']);
    expect(x.lastReply?.name).toBe('u12'); // u14 blocked -> skipped for last replier too
  });

  it('new replies: only when unread, after max(read mark, watermark), excluding own posts', () => {
    const posts = [post(1, 11, 10), post(2, 12, 3), post(3, 99, 2), post(4, 13, 1)];
    expect(build({ posts }).newReplies).toBe(0); // not unread
    const unread = { topics: [{ id: 1, user_id: 10, is_unread: 1 }], posts };
    expect(build({ ...unread, readMarks: new Map([[1, ago(5)]]) }).newReplies).toBe(2);
    expect(build({ ...unread, readMarks: new Map([[1, ago(5)]]), watermark: ago(2.5) }).newReplies).toBe(1);
  });

  it('reactions = opening post + all live replies', () => {
    const x = build({ posts: [post(7, 11, 1), post(8, 12, 1)], opReactions: new Map([[1, 4]]), replyReactions: new Map([[7, 2], [8, 1], [999, 50]]) });
    expect(x.reactions).toBe(7);
  });
});

describe('feed card render', () => {
  const room = { id: 5, slug: 'general', name: 'General', min_post: 'member', min_read: 'member', is_locked: 0, is_exclusive: 0 } as any;
  const member = { id: 99, display_name: 'Me', email_verified: 1, is_approved: 1, access_level: 'member', is_banned: 0 } as any;
  const topic = (over: any = {}) => ({
    id: 1, short_id: 'ABC', room_id: 5, user_id: 10, author_display_name: 'Terry', title: 'Hello', content: 'Plain **bold** text',
    tags: null, is_pinned: 0, is_locked: 0, reply_count: 0, active_reply_count: 0, is_unread: 0,
    created_at: '2020-01-01 00:00:00', last_reply_at: '2020-01-01 00:00:00', view_count: 0, cw_tags: [], ...over,
  });
  const extras = (over: any = {}) => ({ replies: 0, replies24h: 0, newReplies: 0, reactions: 0, lastReply: null, people: [], ...over });
  const render = (t: any, user: any = member, gate = false) => renderTopicCards([t], user, [room], gate);

  it('shows last replier, views, reactions, avatars, new count and the active label', () => {
    const h = render(topic({ active_reply_count: 5, view_count: 41, is_unread: 1,
      extras: extras({ replies: 5, replies24h: HOT_REPLIES_24H, newReplies: 3, reactions: 7,
        lastReply: { name: 'Alton', at: '2020-01-01 00:00:00' }, people: [{ name: 'Alton', avatar_url: null, avatar_color: '#123456' }] }) }));
    expect(h).toContain('↩ <span class="tc-last-name">Alton</span>');
    expect(h).toContain('👁 41');
    expect(h).toContain('❤ 7');
    expect(h).toContain('3 new');
    expect(h).toContain('🔥 Active');
    expect(h).toContain('class="tc-av"');
    expect(h).toContain('class="ago-time"');
  });

  it('below the active threshold there is no active label; old threads are not New', () => {
    const h = render(topic({ extras: extras({ replies24h: HOT_REPLIES_24H - 1 }) }));
    expect(h).not.toContain('🔥 Active');
    expect(h).not.toContain('tc-label-new');
  });

  it('a thread created in the last 24h is labelled New', () => {
    const fresh = sqlNow(new Date(Date.now() - 3600_000));
    expect(render(topic({ created_at: fresh, last_reply_at: fresh }))).toContain('tc-label-new');
  });

  it('drops an excerpt that only repeats the title', () => {
    expect(render(topic({ title: 'hii', content: 'hii' }))).not.toContain('tc-excerpt');
  });

  it('shows a plain-text excerpt, but never for CW-tagged threads', () => {
    expect(render(topic())).toContain('<p class="tc-excerpt">Plain bold text</p>');
    const cw = render(topic({ content: 'graphic detail here', cw_tags: [{ id: 1, name: 'Sensitive', color: '#000', description: '' }] }));
    expect(cw).not.toContain('tc-excerpt');
    expect(cw).not.toContain('graphic detail');
  });

  it('nudges a reply only on unanswered threads the viewer can post in, not their own, not locked', () => {
    const nudge = 'Be the first to reply';
    expect(render(topic())).toContain(nudge);
    expect(render(topic(), null)).not.toContain(nudge);                                   // guest
    expect(render(topic({ user_id: 99 }))).not.toContain(nudge);                         // own thread
    expect(render(topic({ is_locked: 1 }))).not.toContain(nudge);                        // locked
    expect(render(topic({ active_reply_count: 1, reply_count: 1 }))).not.toContain(nudge); // answered
    expect(render(topic(), { ...member, posting_restricted_at: '2026-01-01' }, true)).not.toContain(nudge); // iron gate
    expect(renderTopicCards([topic()], member, [{ ...room, min_post: 'full' }])).not.toContain(nudge); // rank too low
  });

  it('escapes user-controlled names in extras', () => {
    const h = render(topic({ extras: extras({ lastReply: { name: '<b>x</b>', at: '2020-01-01 00:00:00' }, people: [{ name: '<i>', avatar_url: null, avatar_color: '"><script>' }] }) }));
    expect(h).not.toContain('<b>x</b>');
    expect(h).not.toContain('"><script>');
    expect(h).toContain('background:var(--primary)'); // non-hex colour rejected
  });
});

describe('topic views', () => {
  const req = (method = 'GET', ua = 'Mozilla/5.0 (Android 14) Chrome/130') =>
    new Request('https://community.example/t/ABC', { method, headers: ua ? { 'user-agent': ua } : {} });

  it('every human GET counts - guests and repeat visits too', () => {
    expect(isCountableTopicView(req(), null, 10)).toBe(true);
    expect(isCountableTopicView(req(), 99, 10)).toBe(true);
    expect(isCountableTopicView(req(), 99, null)).toBe(true); // anon-authored thread
  });

  it('never counts the author, the poll-vote POST re-render, bots or blank UAs', () => {
    expect(isCountableTopicView(req(), 10, 10)).toBe(false);
    expect(isCountableTopicView(req('POST'), 99, 10)).toBe(false);
    for (const ua of ['Googlebot/2.1', 'facebookexternalhit/1.1', 'Discordbot/2.0', 'curl/8.4', 'python-requests/2.31', 'Mozilla/5.0 HeadlessChrome/120', ''])
      expect(isCountableTopicView(req('GET', ua), null, 10), ua).toBe(false);
  });

  it('a failing bump (column not migrated yet) never throws', async () => {
    const db = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('no such column: view_count'); } }) }) };
    await expect(bumpTopicView({ DB: db } as any, 2)).resolves.toBeUndefined();
  });
});

describe('helpers', () => {
  it('inList: placeholders up to 90 ids, json_each beyond (D1 100-param cap)', () => {
    expect(inList([1, 2])).toEqual({ sql: '(?,?)', params: [1, 2] });
    const big = inList(Array.from({ length: 150 }, (_, i) => i));
    expect(big.sql).toContain('json_each');
    expect(big.params).toHaveLength(1);
    expect(inList([]).sql).toBe('(NULL)');
  });

  it('topicExcerpt strips markdown, images and urls and trims on a word', () => {
    expect(topicExcerpt('# Hi ![img](x.png) see [this](http://a.b) https://c.d/e `code`')).toBe('Hi see this code');
    const long = topicExcerpt('word '.repeat(60));
    expect(long.length).toBeLessThanOrEqual(141);
    expect(long.endsWith('…')).toBe(true);
  });

  it('agoText buckets', () => {
    const n = NOW.getTime();
    expect(agoText(n - 30_000, n)).toBe('just now');
    expect(agoText(n - 5 * 60_000, n)).toBe('5m ago');
    expect(agoText(n - 3 * 3600_000, n)).toBe('3h ago');
    expect(agoText(n - 2 * 86400_000, n)).toBe('2d ago');
    expect(agoText(Date.parse('2026-10-03T00:00:00Z'), n)).toBe('Oct 3');
    expect(agoText(Date.parse('2025-10-03T00:00:00Z'), n)).toBe('Oct 3, 2025');
  });

  it('the layout script still parses (template-literal escapes)', () => {
    expect(() => new Function(LAYOUT_SCRIPT)).not.toThrow();
    expect(SCRIPT_BOOT).toContain("'htmx:oobAfterSwap', updateRelativeTimes");
  });
});

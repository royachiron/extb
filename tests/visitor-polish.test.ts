import 'urlpattern-polyfill';
import { describe, it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => undefined } });
import { database } from './helpers/sqlite';
import { makeCommunityDraft } from '../src/community/draft';
import { localizeHtml } from '../src/lib/localization';
import { renderChat, renderChatParticipants } from '../src/views/chat';
import { badgeHtml } from '../src/views/user-bits';
import worker from '../src/index';

const fetchWorker = (env: Parameters<typeof worker.fetch>[1], path: string, init?: RequestInit) =>
  worker.fetch(new Request('https://forum.example' + path, init), env, {} as ExecutionContext);
const chatRoom = { id: 6, name: 'Chat', slug: 'chat', kind: 'chat', min_read: 'anon', min_post: 'member', is_page: 1, is_locked: 0 } as any;

describe('visitor-facing polish', { timeout: 40000 }, () => {
  it('translates fixed page titles but never usernames or topic titles', () => {
    const page = (title: string) => `<html><head><title>${title} - בחירות 2026</title></head><body></body></html>`;
    expect(localizeHtml(page('Log in'), 'he')).toContain('<title>כניסה - בחירות 2026</title>');
    expect(localizeHtml(page('admin'), 'he')).toContain('<title>admin - בחירות 2026</title>');
    expect(localizeHtml(page('Settings for my band'), 'he')).toContain('<title>Settings for my band - ');
    expect(localizeHtml(page('Community Guidelines &amp; Terms of Use (v3)'), 'he')).toContain('<title>כללי הקהילה ותנאי השימוש (v3) - ');
    expect(localizeHtml(page('Search: a &amp; b'), 'he')).toContain('<title>חיפוש: a &amp; b - ');
  });

  it('offers visitors a login button instead of a message box that only fails on send', () => {
    const guest = renderChat({ user: null, rooms: [chatRoom], activeSlug: 'chat' });
    expect(guest).toContain('href="/login"');
    expect(guest).toContain('<div class="chat-input-inner" hidden>');
    const member = renderChat({ user: { id: 2, display_name: 'dana', access_level: 'member', is_approved: 1 } as any, rooms: [chatRoom], activeSlug: 'chat' });
    expect(member).not.toContain('<p class="chat-readonly-note">');
    expect(member).toContain('<div class="chat-input-inner">');
  });

  it('leaves nameless visitors out of the online list', () => {
    const html = renderChatParticipants(['[guest]', 'dana']);
    expect(html).toContain('data-nick="dana"');
    expect(html.match(/chat-user-item/g)).toHaveLength(1);
  });

  it('draws no role badge when the level is missing', () => {
    expect(badgeHtml(undefined as unknown as string)).toBe('');
    expect(badgeHtml('admin')).toContain('admin');
  });

  it('ends the purpose with punctuation so starter sentences never run together', () => {
    const draft = makeCommunityDraft({ name: 'בחירות 2026', purpose: 'רק בחירות', preset: 'general', language: 'he' });
    expect(draft.homepageCopy).toContain('רק בחירות.\n');
    expect(makeCommunityDraft({ name: 'X', purpose: 'Why not?', preset: 'general', language: 'en' }).homepageCopy).toContain('Why not?\n');
  });

  it('renders missing pages inside the forum layout, in the visitor language', async () => {
    const db = database(); try {
      await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_complete','1')").run();
      const page = await fetchWorker(db.env, '/t/doesnotexist?lang=he', { headers: { Accept: 'text/html' } });
      expect(page.status).toBe(404);
      const html = await page.text();
      expect(html).toContain('class="topnav"');
      expect(html).toContain('הדף לא נמצא');
      const htmx = await fetchWorker(db.env, '/t/doesnotexist', { headers: { Accept: 'text/html', 'hx-request': 'true' } });
      expect(await htmx.text()).toBe('<h1>404</h1>');
      const icon = await fetchWorker(db.env, '/favicon.ico');
      expect(icon.status).toBe(301);
      expect(icon.headers.get('Location')).toBe('/favicon.svg');
    } finally { db.close(); }
  });
});

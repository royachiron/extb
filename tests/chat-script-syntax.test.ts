import { describe, it, expect } from 'vitest';
import { renderChat } from '../src/views/chat';
import type { User } from '../src/types';

// Guards the template-literal footgun: a stray `\n`/`\/` inside the embedded
// chat client script emits broken JS and silently kills the whole chat IIFE.
describe('chat view inline scripts', () => {
  const user = {
    id: 1, email: 'a@b.c', display_name: 'tester', password_hash: '', bio: null,
    avatar_color: '#fff', access_level: 'full', email_verified: 1, is_approved: 1, is_adult: 1,
    show_nsfw: 0, is_banned: 0, mod_note: null, timezone: 'UTC', pronouns: null,
    twitter_url: null, website_url: null, signature: null, cover_image: null,
    hide_activity: 0, hide_bio: 0, require_review: 0, delete_on_approve: 0,
  } as unknown as User;

  const html = renderChat({ user, csrfToken: 'tok', rooms: [], activeSlug: 'chat' });

  it('every <script> block parses as valid JS', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it('emits the /bot intercept and empty-room hints', () => {
    expect(html).toContain('isBotCmd');
    expect(html).toContain('/bot/panel?cmd=');
    expect(html).toContain('chat-empty-hints');
  });

  it('emits the optimistic-send path with its helpers injected', () => {
    expect(html).toContain('var chatPendingMatch = ');
    expect(html).toContain('var chatSendDelay = ');
    expect(html).toContain('function showPending(');
    expect(html).toContain('data-retry');
  });
});

import { describe, it, expect } from 'vitest';
import { renderThread } from '../src/views/dms';
import type { User } from '../src/types';

// Guards the template-literal footgun: a stray `\n`/`\/` inside the embedded
// DM client script emits broken JS and silently kills the WS/poll/typing IIFE.
describe('dms view inline scripts', () => {
  const mkUser = (id: number, name: string) => ({
    id, email: `${name}@b.c`, display_name: name, password_hash: '', bio: null,
    avatar_color: '#fff', access_level: 'full', email_verified: 1, is_approved: 1, is_adult: 1,
    show_nsfw: 0, is_banned: 0, mod_note: null, timezone: 'UTC', pronouns: null,
    twitter_url: null, website_url: null, signature: null, cover_image: null,
    hide_activity: 0, hide_bio: 0, require_review: 0, delete_on_approve: 0,
  } as unknown as User);

  const html = renderThread({
    user: mkUser(1, 'me'),
    other: mkUser(2, 'them'),
    dms: [],
    csrfToken: 'tok',
  });

  it('every <script> block parses as valid JS', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it('emits the thread transport hooks', () => {
    expect(html).toContain('dm-thread');
    expect(html).toContain('dm-textarea');
  });
});

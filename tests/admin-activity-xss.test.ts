import { describe, it, expect } from 'vitest';
import { renderAdmin } from '../src/views/admin';
import type { User } from '../src/types';

const adminUser = {
  id: 1,
  access_level: 'admin',
  is_banned: 0,
  email_verified: 1, is_approved: 1,
  display_name: 'admin',
} as unknown as User;

describe('admin activity log - cat/actor filter pills', () => {
  it('URL-encodes an attribute-breakout payload in the cat param instead of reflecting it raw', () => {
    const payload = '"><script>alert(document.cookie)</script>';
    const html = renderAdmin({
      user: adminUser,
      rooms: [],
      allRooms: [],
      settings: [],
      users: [],
      section: 'activity',
      activityRows: [],
      activityCat: payload,
    });

    // The raw payload must never appear unescaped in an href/hx-get attribute.
    expect(html).not.toContain(`cat=${payload}`);
    expect(html).not.toContain('"><script>alert(document.cookie)</script>');
    // The encoded form should be present instead.
    expect(html).toContain(encodeURIComponent(payload));
  });
});

import { describe, it, expect } from 'vitest';
import { renderProfileEdit } from '../src/views/profile-edit';

// The Remove-photo button used to inline the fallback avatar's HTML inside its onclick
// attribute; the avatar's double quotes ended the attribute early and the markup leaked
// onto the page as a stray pink circle reading `AL">Remove`.
describe('profile edit: remove avatar button', () => {
  const user: any = { id: 1, display_name: 'Alex', avatar_color: '#ec4899', avatar_url: '/media/a.png', timezone: 'UTC' };
  const html = renderProfileEdit({ user, csrfToken: 't' });

  it('keeps HTML out of the onclick attribute', () => {
    const btn = html.match(/<button[^>]*btn-outline-danger[^>]*>(?:<!--extb-ui-->)?Remove(?:<!--\/extb-ui-->)?<\/button>/);
    expect(btn).not.toBeNull();
    const onclick = btn![0].match(/onclick="([^"]*)"/)![1];
    expect(onclick).not.toContain('<');
    expect(onclick).toContain("getElementById('avatar-fallback')");
  });

  it('ships the initials fallback in a template', () => {
    expect(html).toMatch(/<template id="avatar-fallback">[\s\S]*AL[\s\S]*<\/template>/);
  });
});

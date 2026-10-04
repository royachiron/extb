import { describe, expect, it } from 'vitest';
import { renderLayout } from '../src/views/layout';
import { renderAdmin } from '../src/views/admin';
import { localizeHtml } from '../src/lib/localization';
import type { User } from '../src/types';
const applicant = { id: 1, display_name: 'Applicant', access_level: 'member', is_approved: 1, is_banned: 0, intake_status: 'pending', intake_gate_active: true } as User;
describe('discoverable membership workflow', () => {
 it('keeps next steps visible while applicants browse permitted rooms', () => {
  const page = renderLayout({ user: applicant, rooms: [], title: 'Discussion', body: '<p>Topic</p>' });
  expect(page).toContain('href="/membership"');
  expect(page).toContain('Review your membership status and next steps.');
  expect(localizeHtml(page, 'he')).toContain('בדיקת מצב החברות והצעדים הבאים.');
 });
 it('offers the review queue to staff and configuration only to administrators', () => {
  const options = { users: [], rooms: [], allRooms: [], settings: [], csrfToken: 'test' };
  const admin = renderAdmin({ ...options, user: { ...applicant, access_level: 'admin' } });
  const mod = renderAdmin({ ...options, user: { ...applicant, access_level: 'mod' } });
  expect(admin).toContain('href="/admin/intake"');
  expect(mod).toContain('href="/admin/intake"');
  expect(admin).toContain('href="/admin/membership-settings"');
  expect(mod).not.toContain('href="/admin/membership-settings"');
 });
 it('does not show pending notice to existing members or when gate is disabled', () => {
  for (const user of [{ ...applicant, intake_status: 'none' }, { ...applicant, intake_gate_active: false }]) {
   const page = renderLayout({ user: user as User, rooms: [], title: 'Discussion', body: '' });
   expect(page).not.toContain('Review your membership status and next steps.');
  }
 });
});

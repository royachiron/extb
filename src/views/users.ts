import { esc, initials, csrfField } from './layout';
import type { Room, User } from '../types';
import { isAdmin } from '../access';

export function renderUserDirectory(opts: {
  user: User | null;
  rooms: Room[];
  users: User[];
  q?: string;
  csrfToken?: string;
}): string {
  const { user, users, q } = opts;
  const canAdmin = isAdmin(user);

  const userCards = users.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--text-muted);background:var(--card-bg);border-radius:12px;border:1px solid var(--border-color);"><!--extb-ui-->No users found.<!--/extb-ui--></div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px;">
        ${users.map(u => {
          const avatar = u.avatar_url 
            ? `<img src="${esc(u.avatar_url)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.1); border: 2px solid #fff;">`
            : `<span class="avatar" style="width:64px;height:64px;border-radius:50%;background:${esc(u.avatar_color || '#6366f1')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;margin-bottom:12px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">${esc(initials(u.display_name || '?'))}</span>`;
          
          return `
          <div class="post-card" style="padding:16px;flex-direction:column;align-items:center;text-align:center;position:relative;">
            <a href="/u/${esc(u.display_name || '')}" hx-get="/u/${esc(u.display_name || '')}" hx-target=".main" hx-push-url="true" style="display:flex;flex-direction:column;align-items:center;text-decoration:none;color:inherit;">
              ${avatar}
              <strong style="color:var(--text-main);font-size:16px;">${esc(u.display_name || '(no name)')}</strong>
              ${canAdmin ? `<span style="font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${esc(u.access_level)}</span>` : ''}
            </a>
          </div>`;
        }).join('')}
      </div>`;

  return `
    <header class="page-head" style="margin-bottom: 32px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
      <div>
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; color: var(--text-main);"><!--extb-ui-->User Directory<!--/extb-ui--></h1>
        <p class="subtitle" style="margin: 4px 0 0; color: var(--text-muted); font-size: 14px;"><!--extb-ui-->Find and connect with members of the community.<!--/extb-ui--></p>
      </div>
      <form action="/users" style="position:relative;">
        <input name="q" value="${esc(q || '')}" placeholder="Search users..." style="padding:10px 16px 10px 40px; border:1px solid var(--border-color); border-radius:9999px; font-size:14px; width:240px; background: var(--bg-color); color:var(--text-main);">
        <svg style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </form>
    </header>
    ${userCards}
  `;
}

import { esc } from './layout';

// Shared chrome for the /u/:name profile page and the settings tabs
// (profile.ts renderProfile + profile-edit.ts). Split from profile.ts.
export function userSidebar(currentSection: string, profileName?: string, isSelf?: boolean, unresolvedWarnings?: number): string {
  const warnBadge = unresolvedWarnings && unresolvedWarnings > 0
    ? ` <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:var(--danger);color:#fff;font-size:11px;font-weight:800;">${unresolvedWarnings}</span>`
    : '';
  return `
    <aside class="admin-sidebar">
      <h3>${isSelf ? 'My Account' : 'User Profile'}</h3>
      <ul>
        ${profileName ? `<li><a href="/u/${esc(profileName)}" hx-get="/u/${esc(profileName)}" hx-target=".main" hx-push-url="true" class="${currentSection === 'profile' ? 'active' : ''}">👤 View Profile</a></li>` : ''}
        ${isSelf ? `
          <li><a href="/settings/profile" hx-get="/settings/profile" hx-target=".main" hx-push-url="true" class="${currentSection === 'settings' ? 'active' : ''}">⚙️ Settings</a></li>
          <li><a href="/settings/warnings" hx-get="/settings/warnings" hx-target=".main" hx-push-url="true" class="${currentSection === 'warnings' ? 'active' : ''}">⚠️ Warnings${warnBadge}</a></li>
        ` : ''}
        <li><a href="/dms" hx-get="/dms" hx-target=".main" hx-push-url="true">✉️ Direct Messages</a></li>
      </ul>
    </aside>
  `;
}

export const DASHBOARD_STYLE = `
  <style>
    .admin-layout { display: grid; grid-template-columns: 200px 1fr; gap: 40px; margin-top: 20px; }
    .admin-sidebar h3 { font-size: 12px; text-transform: uppercase; color: var(--text-muted); font-weight: 800; margin-bottom: 16px; padding-left: 12px; }
    .admin-sidebar ul { list-style: none; padding: 0; margin: 0; }
    .admin-sidebar a { display: block; padding: 10px 14px; border-radius: 8px; color: var(--text-main); font-weight: 600; text-decoration: none; margin-bottom: 4px; transition: all 0.2s; }
    .admin-sidebar a:hover { background: #f3f4f6; }
    .admin-sidebar a.active { background: var(--primary); color: #fff !important; }
    .admin-content { min-width: 0; }
    .admin-sidebar { min-width: 0; }
    @media (max-width: 1024px) {
      .admin-layout { grid-template-columns: 1fr; }
      .admin-sidebar { overflow-x: hidden; }
      .admin-sidebar ul { display: flex; overflow-x: auto; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 24px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .admin-sidebar ul::-webkit-scrollbar { display: none; }
      .admin-sidebar a { white-space: nowrap; margin-bottom: 0; }
    }
  </style>
`;

import { esc, csrfField, initials } from '../layout';
import { relativeDate } from './shared';
import type { User } from '../../types';

export type UserListStatus = 'active' | 'pending' | 'all';

export function renderUserEditDrawer(u: User, csrfToken?: string, userBadges?: any[], allBadges?: any[]): string {
  return `
    <div id="admin-edit-drawer" class="drawer-overlay open" onclick="if(event.target===this) this.remove()">
      <div class="drawer-content" role="dialog" aria-modal="true" aria-labelledby="edit-user-drawer-${u.id}-title">
        <div class="drawer-header">
          <h2 id="edit-user-drawer-${u.id}-title">Edit User: ${esc(u.display_name || u.email)}</h2>
          <button type="button" onclick="this.closest('.drawer-overlay').remove()" class="drawer-close" aria-label="Close">&times;</button>
        </div>
        <form method="POST" action="/admin/user/update" hx-post="/admin/user/update" class="drawer-form" hx-target="body">
          ${csrfField({ csrfToken })}
          <input type="hidden" name="user_id" value="${u.id}">

          <div class="drawer-body">
            <div class="drawer-grid">
              <div class="drawer-main">
                <section class="drawer-section">
                  <h3 class="drawer-section-title">Identity & Profile</h3>
                  <div class="drawer-field">
                    <label for="edu-${u.id}-display_name">Display Name</label>
                    <input id="edu-${u.id}-display_name" type="text" name="display_name" value="${esc(u.display_name || '')}" maxlength="32">
                  </div>
                  <div class="drawer-row">
                    <div class="drawer-field">
                      <label for="edu-${u.id}-pronouns">Pronouns</label>
                      <input id="edu-${u.id}-pronouns" type="text" name="pronouns" value="${esc(u.pronouns || '')}" maxlength="32" placeholder="e.g. they/them">
                    </div>
                    <div class="drawer-field">
                      <label for="edu-${u.id}-avatar_color">Avatar Color</label>
                      <input id="edu-${u.id}-avatar_color" type="color" name="avatar_color" value="${u.avatar_color || '#6366f1'}">
                    </div>
                  </div>
                  <div class="drawer-field">
                    <label for="edu-${u.id}-bio">Public Bio</label>
                    <textarea id="edu-${u.id}-bio" name="bio" rows="4" maxlength="500">${esc(u.bio || '')}</textarea>
                  </div>
                  <div class="drawer-field">
                    <label for="edu-${u.id}-signature">Forum Signature</label>
                    <textarea id="edu-${u.id}-signature" name="signature" rows="2" maxlength="300">${esc(u.signature || '')}</textarea>
                  </div>
                  <div class="drawer-field">
                    <label for="edu-${u.id}-timezone">Timezone</label>
                    <input id="edu-${u.id}-timezone" type="text" name="timezone" value="${esc(u.timezone || '')}" placeholder="e.g. America/New_York">
                  </div>
                </section>


              </div>

              <aside class="drawer-sidebar">
                <section class="drawer-section">
                  <h3 class="drawer-section-title">Moderator Notes</h3>
                  <div class="drawer-field">
                    <textarea id="edu-${u.id}-mod_note" name="mod_note" rows="10" placeholder="Internal notes about this user..." style="font-size:12px; line-height:1.4;">${esc(u.mod_note || '')}</textarea>
                  </div>
                </section>

                <section class="drawer-section">
                  <h3 class="drawer-section-title">Settings & Privacy</h3>
                  <div class="drawer-checkbox-group">
                    <label><input type="checkbox" name="hide_activity" value="1" ${u.hide_activity ? 'checked' : ''}> Hide activity from public</label>
                    <label><input type="checkbox" name="hide_bio" value="1" ${u.hide_bio ? 'checked' : ''}> Hide bio from public</label>
                    <label><input type="checkbox" name="show_nsfw" value="1" ${u.show_nsfw ? 'checked' : ''}> View NSFW content</label>
                    <label><input type="checkbox" name="allow_dms" value="1" ${u.allow_dms ? 'checked' : ''}> Allow direct messages</label>
                    <label><input type="checkbox" name="remove_avatar" value="1"> Reset Profile Picture</label>
                    <label><input type="checkbox" name="remove_cover" value="1"> Reset Cover Image</label>
                  </div>
                </section>

                <section class="drawer-section">
                  <h3 class="drawer-section-title">Links</h3>
                  <div class="drawer-field">
                    <label>Website</label>
                    <input type="url" name="website_url" value="${esc(u.website_url || '')}" placeholder="https://...">
                  </div>
                  <div class="drawer-field">
                    <label>Twitter</label>
                    <input type="url" name="twitter_url" value="${esc(u.twitter_url || '')}" placeholder="https://...">
                  </div>
                </section>
              </aside>
            </div>
          </div>

          <div class="drawer-footer">
            <button type="button" class="btn btn-ghost" onclick="this.closest('.drawer-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary" style="min-width:140px;">Save Changes</button>
          </div>
        </form>

        <div style="border-top:1px solid var(--border-color); padding:16px 24px;">
          <h3 class="drawer-section-title" style="margin-bottom:12px;">Badges</h3>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; min-height:28px;">
            ${(userBadges || []).length === 0
              ? `<span style="color:var(--text-muted);font-size:13px;">No badges assigned</span>`
              : (userBadges || []).map(b => `
              <form method="POST" action="/admin/user/badge/remove"
                    hx-post="/admin/user/badge/remove"
                    hx-target="#admin-edit-modal-container"
                    style="display:inline-flex;align-items:center;">
                ${csrfField({ csrfToken })}
                <input type="hidden" name="user_id" value="${u.id}">
                <input type="hidden" name="badge_id" value="${b.id}">
                <span style="display:inline-flex;align-items:center;gap:4px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:3px 8px 3px 10px;font-size:13px;color:var(--text-main);">
                  ${b.icon ? `${esc(b.icon)} ` : ''}${esc(b.name)}
                  <button type="submit" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:15px;padding:0 0 0 4px;line-height:1;" title="Remove badge">&times;</button>
                </span>
              </form>`).join('')}
          </div>
          ${(allBadges || []).filter(b => !(userBadges || []).some((ub: any) => ub.id === b.id)).length > 0 ? `
          <form method="POST" action="/admin/user/badge/assign"
                hx-post="/admin/user/badge/assign"
                hx-target="#admin-edit-modal-container"
                style="display:flex; gap:8px; align-items:center;">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="user_id" value="${u.id}">
            <select name="badge_id" style="flex:1; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; background:var(--card-bg); color:var(--text-main);">
              ${(allBadges || [])
                .filter(b => !(userBadges || []).some((ub: any) => ub.id === b.id))
                .map(b => `<option value="${b.id}">${b.icon ? esc(b.icon) + ' ' : ''}${esc(b.name)}</option>`)
                .join('')}
            </select>
            <select name="status" style="width:90px; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; background:var(--card-bg); color:var(--text-main);">
              <option value="have">Have</option>
              <option value="need">Need</option>
            </select>
            <button type="submit" class="btn btn-sm btn-primary">Add</button>
          </form>` : `<span style="color:var(--text-muted);font-size:13px;">All badges assigned</span>`}
        </div>
      </div>
    </div>
  `;
}

// Pick readable text color for a hex background (perceived luminance threshold).
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1] ?? '0', 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1a1a' : '#fff';
}

type UserSort = 'recent' | 'name' | 'role' | 'active';

export function renderUsers(opts: {
  users: User[];
  userCounts?: { active: number; pending: number; total: number };
  userStatus?: UserListStatus;
  csrfToken?: string;
  q?: string;
  sort?: UserSort;
  page?: number;
  pageSize?: number;
  filter?: { role?: string; banned?: boolean; unverified?: boolean; review?: boolean };
  viewerIsAdmin?: boolean;
}): string {
  const status: UserListStatus = opts.userStatus || 'active';
  const counts = opts.userCounts || { active: 0, pending: 0, total: 0 };
  const query = opts.q || '';
  const sort: UserSort = opts.sort || 'recent';
  const page = opts.page || 0;
  const pageSize = opts.pageSize || 100;
  const filter = opts.filter || {};
  const rowActionsLocked = opts.viewerIsAdmin === false;

  const rows = opts.users.map(u => `
    <tr class="user-row-item${u.is_banned ? ' banned' : ''}">
      <td class="col-avatar">
        <a class="admin-avatar" href="/u/${esc(u.display_name || '')}" target="_blank" title="Open public profile" style="background:${esc(u.avatar_color || '#6366f1')}; color:${textOn(u.avatar_color || '#6366f1')};">
          ${u.avatar_url
            ? `<img src="${esc(u.avatar_url)}" alt="">`
            : esc(initials(u.display_name || '?'))}
        </a>
      </td>
      <td class="col-user">
        <div class="user-main-name">${u.display_name
          ? `<button type="button" class="user-name-btn" hx-get="/admin/user/${u.id}/edit" hx-target="#admin-edit-modal-container" hx-swap="innerHTML"><strong>${esc(u.display_name)}</strong></button>`
          : '<span style="color:var(--text-muted);font-style:italic;">Anonymous (unfinished setup)</span>'}</div>
        <div class="user-meta-role">
          ${u.is_banned ? '<span class="badge badge-danger">BANNED</span>' : `<span class="badge-role">${esc(u.access_level)}</span>`}
          ${u.has_club ? ' &middot; <span style="color:var(--primary);font-size:10px;font-weight:700;">CLUB</span>' : ''}
          ${u.is_approved ? '' : ' &middot; <span style="color:var(--danger);font-size:10px;font-weight:700;">PENDING</span>'}
          ${u.require_review ? ' &middot; <span style="color:var(--primary);font-size:10px;font-weight:700;">REVIEW-FIRST</span>' : ''}
        </div>
      </td>
      <td class="col-email">
        <span class="email-text">${esc(u.email)}</span>
        <button type="button" class="copy-email" title="Copy email" data-email="${esc(u.email || '')}" onclick="navigator.clipboard.writeText(this.dataset.email); this.textContent='✓'; setTimeout(()=>this.textContent='⧉',1200)">⧉</button>
      </td>
      <td class="col-joined" title="${esc(new Date(u.created_at).toLocaleString())}">${relativeDate(u.created_at)}</td>
      <td class="col-active" title="${u.last_visit_at ? esc(new Date(u.last_visit_at).toLocaleString()) : 'never'}">${u.last_visit_at ? relativeDate(u.last_visit_at) : '<span style="color:var(--text-muted);font-style:italic;">never</span>'}</td>
      <td class="col-actions" style="text-align:right;">
        <div class="row-actions${rowActionsLocked ? ' admin-locked' : ''}"${rowActionsLocked ? ' title="Admin only"' : ''}>
        <button class="btn btn-sm btn-primary" hx-get="/admin/user/${u.id}/edit" hx-target="#admin-edit-modal-container" hx-swap="innerHTML">Edit</button>
        <details class="admin-actions-menu">
          <summary class="btn-ghost action-trigger">&middot;&middot;&middot;</summary>
          <div class="admin-dropdown">
            <a href="/u/${esc(u.display_name || '')}" target="_blank">Public Profile</a>
            <div class="dropdown-sep"></div>
            <form method="POST" action="/admin/user/access" hx-post="/admin/user/access" hx-swap="none">
              ${csrfField(opts)}
              <input type="hidden" name="user_id" value="${u.id}">
              <div style="padding:4px 8px; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Change Role</div>
              <select name="access_level" onchange="const sel=this; confirmAction('Change role?', 'Set ${esc(u.display_name || 'this user')} to '+sel.value+'?', 'Change', () => sel.form.requestSubmit())" style="margin:4px 8px; width:calc(100% - 16px);">
                ${['member', 'full', 'mod', 'admin'].map(v => `<option value="${v}"${u.access_level === v ? ' selected' : ''}>${v === 'full' ? 'Trusted member' : v}</option>`).join('')}
              </select>
            </form>
            <form method="POST" action="/admin/user/club" hx-post="/admin/user/club" hx-swap="none">
              ${csrfField(opts)}
              <input type="hidden" name="user_id" value="${u.id}">
              <input type="hidden" name="club" value="${u.has_club ? '0' : '1'}">
              <button type="submit">${u.has_club ? 'Remove Club' : 'Mark Club'}</button>
            </form>
            <div class="dropdown-sep"></div>
            <form method="POST" action="/admin/user/review" style="margin:0;">
              ${csrfField(opts)}
              <input type="hidden" name="user_id" value="${u.id}">
              <input type="hidden" name="require_review" value="${u.require_review ? '0' : '1'}">
              <button type="submit">${u.require_review ? 'Disable Review-First' : 'Enable Review-First'}</button>
            </form>
            <form id="ban-form-${u.id}" method="POST" action="/admin/user/ban" hx-post="/admin/user/ban" hx-swap="none" style="margin:0;">
              ${csrfField(opts)}
              <input type="hidden" name="user_id" value="${u.id}">
              <input type="hidden" name="is_banned" value="${u.is_banned ? '0' : '1'}">
              <input type="hidden" id="ban-reason-${u.id}" name="reason" value="">
              <button type="button" class="ban-btn ${u.is_banned ? 'unban' : 'ban'}" onclick="if(!${u.is_banned}){ const reason = prompt('Reason for ban (emailed to user):'); if(reason === null) return; document.getElementById('ban-reason-${u.id}').value = reason; } confirmAction('${u.is_banned ? 'Unban' : 'Ban'} User?', 'Confirm ${u.is_banned ? 'unbanning' : 'banning'} ${esc(u.display_name || 'this user')}?', '${u.is_banned ? 'Unban' : 'Ban'}', () => document.getElementById('ban-form-${u.id}').requestSubmit())">
                ${u.is_banned ? 'Unban User' : 'Ban User'}
              </button>
            </form>
            <div class="dropdown-sep"></div>
            <form id="delete-form-${u.id}" method="POST" action="/admin/user/delete" hx-post="/admin/user/delete" hx-target="closest tr" hx-confirm="This permanently anonymizes this user. Cannot be undone. Proceed?" hx-swap="outerHTML" style="margin:0;">
              ${csrfField(opts)}
              <input type="hidden" name="user_id" value="${u.id}">
              <button type="submit" class="ban-btn ban">Delete User</button>
            </form>
          </div>
        </details>
        </div>
      </td>
    </tr>
  `).join('');

  // Preserve status + query + active filters across sort/filter/page navigation.
  const baseParams = (extra: Record<string, string | number | undefined>) => {
    const p: Record<string, string> = { section: 'users', status, sort };
    if (query) p.q = query;
    if (filter.role) p.role = filter.role;
    if (filter.banned) p.banned = '1';
    if (filter.unverified) p.unverified = '1';
    if (filter.review) p.review = '1';
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '') delete p[k]; else p[k] = String(v);
    }
    return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  };
  const navAttrs = (qs: string) => `href="/admin?${qs}" hx-get="/admin?${qs}" hx-target=".main" hx-push-url="true"`;
  const sortLink = (key: UserSort, label: string) =>
    `<a ${navAttrs(baseParams({ sort: key, page: undefined }))} class="th-sort${sort === key ? ' active' : ''}">${label}${sort === key ? ' ↓' : ''}</a>`;
  const filterPill = (label: string, params: Record<string, string | undefined>, isActive: boolean) =>
    `<a ${navAttrs(baseParams({ ...params, page: undefined }))} class="filter-pill${isActive ? ' active' : ''}">${label}</a>`;

  return `
    <style>
      .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 20px; }
      .search-box { flex: 1; max-width: 400px; position: relative; }
      .search-box input { width: 100%; padding: 10px 16px; border-radius: 999px; border: 1.5px solid var(--border-color); background: var(--card-bg); font-size: 14px; transition: border-color 0.2s; }
      .search-box input:focus { border-color: var(--primary); outline: none; }
      
      .admin-table { border-collapse: separate; border-spacing: 0; }
      .user-row-item td { padding: 14px 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
      .admin-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 14px; overflow: hidden; }
      .admin-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .user-main-name { font-size: 15px; color: var(--text-main); margin-bottom: 2px; }
      .user-meta-role { display: flex; align-items: center; gap: 6px; font-size: 11px; }
      .badge-role { background: #f3f4f6; color: #4b5563; padding: 1px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
      
      .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: none; justify-content: flex-end; backdrop-filter: blur(2px); }
      .drawer-overlay.open { display: flex; }
      .drawer-content { width: 100%; max-width: 900px; background: var(--bg-color); height: 100%; display: flex; flex-direction: column; animation: drawer-slide 0.3s ease-out; box-shadow: -10px 0 30px rgba(0,0,0,0.15); }
      @keyframes drawer-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .drawer-header { padding: 20px 32px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); }
      .drawer-header h2 { margin: 0; font-size: 20px; font-weight: 800; }
      .drawer-close { background: none; border: none; font-size: 32px; cursor: pointer; color: var(--text-muted); line-height: 1; padding: 0; }
      .drawer-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
      .drawer-body { flex: 1; overflow-y: auto; padding: 32px; }
      .drawer-footer { padding: 20px 32px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; background: var(--card-bg); }
      
      .drawer-grid { display: grid; grid-template-columns: 1fr 300px; gap: 32px; }
      .drawer-section { margin-bottom: 32px; }
      .drawer-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 0 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
      .drawer-field { margin-bottom: 16px; }
      .drawer-field label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; color: var(--text-main); }
      .drawer-field input[type="text"], .drawer-field input[type="number"], .drawer-field input[type="url"], .drawer-field textarea, .drawer-field select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1.5px solid var(--border-color); background: var(--card-bg); color: var(--text-main); font: inherit; font-size: 14px; }
      .drawer-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .drawer-checkbox-group { display: flex; flex-direction: column; gap: 12px; background: var(--card-bg); padding: 16px; border-radius: 12px; border: 1.5px solid var(--border-color); }
      .drawer-checkbox-group label { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .admin-digit-container { background: var(--card-bg); border: 1.5px solid var(--border-color); border-radius: 12px; padding: 16px; overflow-x: auto; }
      
      .row-actions { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
      .admin-actions-menu { position: relative; display: inline-block; }
      .admin-actions-menu summary { list-style: none; }
      .admin-actions-menu summary::-webkit-details-marker { display: none; }
      .admin-actions-menu .action-trigger { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; font-size: 18px; line-height: 1; color: var(--text-muted, #888); cursor: pointer; user-select: none; transition: background 0.12s ease; }
      .admin-actions-menu .action-trigger:hover { background: var(--surface-hover, rgba(0,0,0,0.06)); color: var(--text-main); }
      .admin-actions-menu[open] .action-trigger { background: var(--surface-hover, rgba(0,0,0,0.06)); }
      .admin-dropdown { position: absolute; right: 0; top: 100%; z-index: 50; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 190px; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
      .admin-dropdown a, .admin-dropdown button { display: block; width: 100%; text-align: left; padding: 8px 12px; border-radius: 6px; background: none; border: none; color: var(--text-main); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
      .admin-dropdown a:hover, .admin-dropdown button:hover { background: var(--bg-color); }
      .admin-dropdown .ban-btn.ban { color: var(--danger); }
      .dropdown-sep { height: 1px; background: var(--border-color); margin: 4px 0; }

      /* Mobile: open the row dropdown as a bottom sheet pinned above the fixed
         bottom-nav (z-index 100, 62px tall). Without this the tail items
         (Ban/Delete User) sit behind the nav at every scroll position and can
         never be tapped. */
      @media (max-width: 768px) {
        .admin-actions-menu[open] .admin-dropdown {
          position: fixed; left: 12px; right: 12px; top: auto;
          bottom: calc(70px + env(safe-area-inset-bottom, 0px));
          z-index: 1001; min-width: 0;
          max-height: 60vh; overflow-y: auto;
          box-shadow: 0 -8px 30px rgba(0,0,0,0.22);
        }
      }

      /* sticky header - NB: card must NOT clip/scroll, or the row dropdown gets cut off */
      .user-table-card { overflow: visible; border-radius: 12px; }
      .admin-table thead th { position: sticky; top: 0; z-index: 5; background: var(--card-bg); }
      /* clickable name */
      .user-name-btn { background: none; border: none; padding: 0; font: inherit; color: var(--text-main); cursor: pointer; text-align: left; }
      .user-name-btn:hover strong { text-decoration: underline; }
      /* banned row */
      .user-row-item.banned { opacity: 0.55; }
      .user-row-item.banned .user-name-btn strong { text-decoration: line-through; }
      /* copy-email */
      .copy-email { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 13px; margin-left: 6px; opacity: 0; transition: opacity 0.12s; }
      .col-email:hover .copy-email { opacity: 1; }
      /* result count + pager */
      .result-count { font-size: 12px; color: var(--text-muted); margin: 8px 2px 12px; }
      .pager { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 16px 0; }
      .pager-info { font-size: 13px; color: var(--text-muted); }
      /* sortable headers */
      .th-sort { color: inherit; text-decoration: none; cursor: pointer; }
      .th-sort:hover { color: var(--primary); }
      .th-sort.active { color: var(--primary); font-weight: 800; }
      /* filter bar */
      .user-filter-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 2px 12px; }
      .user-filter-bar select { padding: 6px 10px; border-radius: 8px; border: 1.5px solid var(--border-color); background: var(--card-bg); color: var(--text-main); font: inherit; font-size: 13px; }
      .filter-pill { font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 1.5px solid var(--border-color); background: var(--card-bg); color: var(--text-muted); text-decoration: none; cursor: pointer; }
      .filter-pill.active { border-color: var(--primary); color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
      /* loading spinner */
      .users-spinner { display: none; width: 14px; height: 14px; border: 2px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: users-spin 0.6s linear infinite; margin-left: 8px; }
      .htmx-request.users-spinner, .htmx-request .users-spinner { display: inline-block; }
      @keyframes users-spin { to { transform: rotate(360deg); } }

      @media (max-width: 900px) {
        .drawer-grid { grid-template-columns: 1fr; }
        .drawer-content { max-width: 100%; }
        .col-email, .col-joined, .col-active { display: none; }
      }
    </style>
    <div class="section-header">
      <h1 class="page-title">User Management</h1>
      <form class="search-box" hx-get="/admin?section=users" hx-target=".main" hx-push-url="true" hx-trigger="submit, input changed delay:300ms" hx-indicator="#users-spinner">
        <input type="hidden" name="section" value="users">
        <input type="hidden" name="status" value="${status}">
        <input type="hidden" name="sort" value="${sort}">
        ${filter.role ? `<input type="hidden" name="role" value="${esc(filter.role)}">` : ''}
        ${filter.banned ? '<input type="hidden" name="banned" value="1">' : ''}
        ${filter.unverified ? '<input type="hidden" name="unverified" value="1">' : ''}
        ${filter.review ? '<input type="hidden" name="review" value="1">' : ''}
        <input type="text" name="q" value="${esc(query)}" placeholder="Search by name or email...  ( / to focus )" autofocus onfocus="this.setSelectionRange(this.value.length, this.value.length)">
        <span id="users-spinner" class="htmx-indicator users-spinner" aria-hidden="true"></span>
      </form>
    </div>
    <nav class="user-status-pills">
      <a ${navAttrs(baseParams({ status: 'active', page: undefined }))} class="${status === 'active' ? 'active' : ''}">Active<span class="pill-count">${counts.active}</span></a>
      <a ${navAttrs(baseParams({ status: 'pending', page: undefined }))} class="${status === 'pending' ? 'active' : ''}">Pending setup<span class="pill-count">${counts.pending}</span></a>
      <a ${navAttrs(baseParams({ status: 'all', page: undefined }))} class="${status === 'all' ? 'active' : ''}">All<span class="pill-count">${counts.total}</span></a>
    </nav>
    <div class="user-filter-bar">
      <select onchange="window.location='/admin?'+'${baseParams({ role: undefined, page: undefined })}'+(this.value?'&role='+this.value:'')">
        <option value=""${!filter.role ? ' selected' : ''}>All roles</option>
        ${['member', 'full', 'mod', 'admin'].map(v => `<option value="${v}"${filter.role === v ? ' selected' : ''}>${v === 'full' ? 'Trusted member' : v}</option>`).join('')}
      </select>
      ${filterPill('Banned', { banned: filter.banned ? undefined : '1' }, !!filter.banned)}
      ${filterPill('Unverified', { unverified: filter.unverified ? undefined : '1' }, !!filter.unverified)}
      ${filterPill('Review-first', { review: filter.review ? undefined : '1' }, !!filter.review)}
    </div>
    <div class="result-count">Page ${page + 1} &middot; ${opts.users.length} shown${opts.users.length >= pageSize ? ' (page full &mdash; use Next)' : ''}</div>
    <div class="card user-table-card" style="padding:0;">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:60px;"></th>
            <th>${sortLink('name', 'User')}</th>
            <th class="col-email">Email</th>
            <th class="col-joined">${sortLink('recent', 'Joined')}</th>
            <th class="col-active">${sortLink('active', 'Last active')}</th>
            <th style="text-align:right; width:120px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" class="empty-state">${query ? `No users found matching "${esc(query)}".` : (status === 'pending' ? 'No abandoned registrations &mdash; clean slate.' : 'No users found.')}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pager">
      ${page > 0 ? `<a ${navAttrs(baseParams({ page: page - 1 }))} class="btn btn-sm">&larr; Prev</a>` : ''}
      <span class="pager-info">Page ${page + 1}</span>
      ${opts.users.length >= pageSize ? `<a ${navAttrs(baseParams({ page: page + 1 }))} class="btn btn-sm">Next &rarr;</a>` : ''}
    </div>
    <script>
      (function(){
        document.addEventListener('keydown', function(e){
          var box = document.querySelector('.search-box input[name="q"]');
          if (!box) return;
          if (e.key === '/' && document.activeElement !== box) { e.preventDefault(); box.focus(); }
          if (e.key === 'Escape' && document.activeElement === box) { box.value=''; box.dispatchEvent(new Event('input',{bubbles:true})); }
        });
      })();
    </script>
  `;
}

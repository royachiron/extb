import { esc, csrfField } from '../layout';
import type { User } from '../../types';

export function renderBadges(opts: { badges?: any[], users: User[], csrfToken?: string }): string {
  const badges = opts.badges || [];
  const list = badges.map(b => {
    const tc = esc(b.text_color || '#ffffff');
    return `
    <div class="card" style="margin-bottom:12px; padding:16px;">
      <form method="POST" action="/admin/badges/${b.id}/update" hx-post="/admin/badges/${b.id}/update" hx-target=".main" class="badge-edit-form">
        ${csrfField(opts)}
        <span class="badge-edit-pill" style="display:inline-block;background:${esc(b.color)};color:${tc};padding:4px 12px;border-radius:999px;font-weight:800;font-size:13px;min-width:90px;text-align:center;" title="Live preview reflects saved state">${esc(b.icon)} ${esc(b.name)}</span>
        <div class="badge-edit-text" style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <input type="text" name="name" value="${esc(b.name)}" required style="font-size:13px; min-width:0; width:100%;">
          <input type="text" name="icon" value="${esc(b.icon)}" required maxlength="8" style="font-size:13px; min-width:0; width:100%;">
        </div>
        <label style="display:flex; flex-direction:column; gap:2px; font-size:11px; color:var(--text-muted); min-width:0;">Pill
          <input type="color" name="color" value="${esc(b.color)}" style="height:36px; width:100%; min-width:0;">
        </label>
        <label style="display:flex; flex-direction:column; gap:2px; font-size:11px; color:var(--text-muted); min-width:0;">Text
          <input type="color" name="text_color" value="${esc(b.text_color || '#ffffff')}" style="height:36px; width:100%; min-width:0;">
        </label>
        <input class="badge-edit-desc" type="text" name="description" value="${esc(b.description || '')}" placeholder="Description" style="font-size:13px; min-width:0; width:100%;">
        <div class="badge-edit-actions" style="display:flex; gap:6px;">
          <button type="submit" class="btn btn-sm">Save</button>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="if(confirm('Delete badge ${esc(b.name)}? Removes from all users.'))document.getElementById('del-badge-${b.id}').requestSubmit()">×</button>
        </div>
      </form>
      <form id="del-badge-${b.id}" method="POST" action="/admin/badges/${b.id}/delete" hx-post="/admin/badges/${b.id}/delete" hx-target=".main" style="display:none;">
        ${csrfField(opts)}
      </form>
    </div>
  `;
  }).join('');

  return `
    <style>
      .badges-layout { display:grid; grid-template-columns: 1fr 400px; gap:32px; }
      .badge-edit-form { display:grid; grid-template-columns: auto 1fr 110px 110px 1fr auto; gap:12px; align-items:center; }
      @media (max-width: 900px) {
        .badges-layout { grid-template-columns: 1fr; }
        .badge-edit-form { grid-template-columns: 1fr 1fr; gap:10px; }
        .badge-edit-form > span.badge-edit-pill { grid-column: 1 / -1; justify-self: start; }
        .badge-edit-form > div.badge-edit-text { grid-column: 1 / -1; }
        .badge-edit-form > input.badge-edit-desc { grid-column: 1 / -1; }
        .badge-edit-form > div.badge-edit-actions { grid-column: 1 / -1; justify-content: flex-end; }
      }
    </style>
    <h1 class="page-title">Community Badges</h1>
    <div class="badges-layout">
      <div style="min-width:0;">
        <h2 style="font-size:18px; font-weight:800; margin-bottom:16px;">Existing Badges</h2>
        ${list || '<p class="empty-state">No badges created yet.</p>'}
      </div>
      <div style="min-width:0;">
        <div class="card" style="padding:24px; margin-bottom:24px;">
          <h2 style="font-size:18px; font-weight:800; margin-bottom:20px;">Create Badge</h2>
          <form method="POST" action="/admin/badges" hx-post="/admin/badges" hx-target=".main" style="display:flex; flex-direction:column; gap:16px;">
            ${csrfField(opts)}
            <div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Verified Surgeon"></div>
            <div class="field"><label>Icon (emoji)</label><input type="text" name="icon" required placeholder="e.g. 🩺"></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="field"><label>Pill color</label><input type="color" name="color" value="#6366f1" style="height:40px; width:100%;"></div>
              <div class="field"><label>Text color</label><input type="color" name="text_color" value="#ffffff" style="height:40px; width:100%;"></div>
            </div>
            <div class="field"><label>Description</label><textarea name="description" rows="2"></textarea></div>
            <button type="submit" class="btn">Create Badge</button>
          </form>
        </div>
        <div class="card" style="padding:24px;">
          <h2 style="font-size:18px; font-weight:800; margin-bottom:20px;">Assign to User</h2>
          <form method="POST" action="/admin/user/badge" hx-post="/admin/user/badge" hx-target=".main" style="display:flex; flex-direction:column; gap:16px;">
            ${csrfField(opts)}
            <div class="field">
              <label>User ID</label>
              <input type="number" name="user_id" required>
            </div>
            <div class="field">
              <label>Badge</label>
              <select name="badge_id" required>
                ${badges.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-secondary">Assign Badge</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

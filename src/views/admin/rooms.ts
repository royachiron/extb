import { esc, csrfField, roomIcon } from '../layout';
import type { Room } from '../../types';

export function renderRooms(opts: { allRooms: Room[]; csrfToken?: string }): string {
  const renderCard = (r: Room) => `
    <div class="card room-card">
      <form method="POST" action="/admin/room/update" hx-post="/admin/room/update" hx-swap="none">
        ${csrfField(opts)}
        <input type="hidden" name="id" value="${r.id}">

        <div class="room-card-header">
          <div class="room-identity">
            <span class="room-icon-preview">${roomIcon(r)}</span>
            <strong class="room-name-display">${esc(r.name)}</strong>
          </div>
          <div class="room-sort-badge">
            Sort: <input type="number" name="sort_order" value="${r.sort_order}" min="0" max="999" step="1">
          </div>
        </div>

        <div class="room-slug-line">/r/${esc(r.slug)}</div>

        <div class="room-form-grid">
          <div class="field">
            <label>Display Name</label>
            <input type="text" name="name" value="${esc(r.name)}" required maxlength="64">
          </div>
          <div class="field">
            <label>Room Type</label>
            <div class="room-kind-badge room-kind-${esc(r.kind)}">${esc(r.kind)}${r.kind === 'chat' ? ' &#128172;' : ''}</div>
          </div>
          <div class="field full-width">
            <label>Description</label>
            <textarea name="description" rows="2" maxlength="500">${esc(r.description || '')}</textarea>
          </div>
          <div class="field">
            <label>Icon (one emoji)</label>
            <input type="text" name="icon" value="${esc(r.icon || '')}" placeholder="e.g. 🦿" maxlength="8">
          </div>

          <div class="field">
            <label>Read Gate</label>
            <select name="min_read">
              ${['anon', 'member', 'full', 'mod'].map(v => `<option value="${v}"${r.min_read === v ? ' selected' : ''}>${v === 'full' ? 'Trusted member' : v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Post Gate</label>
            <select name="min_post">
              ${['member', 'full', 'mod'].map(v => `<option value="${v}"${r.min_post === v ? ' selected' : ''}>${v === 'full' ? 'Trusted member' : v}</option>`).join('')}
            </select>
          </div>

          <div class="checkbox-group">
            <label><input type="checkbox" name="is_locked" value="1" ${r.is_locked ? 'checked' : ''}> Locked</label>
            <label><input type="checkbox" name="is_page" value="1" ${r.is_page ? 'checked' : ''}> Has Page</label>
            <label><input type="checkbox" name="is_exclusive" value="1" ${r.is_exclusive ? 'checked' : ''}> Exclusive (invite-only)</label>
          </div>
        </div>

        <div class="room-card-actions">
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
      <form method="POST" action="/admin/room/delete" hx-post="/admin/room/delete" hx-swap="none" style="margin-top:8px;">
        ${csrfField(opts)}
        <input type="hidden" name="id" value="${r.id}">
        <button type="button" data-confirm="${r.kind === 'chat' ? 'This is a CHAT room. Archiving removes it from the chat switcher and hides its history. Continue?' : 'Archive this room? Content is preserved but the room disappears from the forum.'}" class="btn btn-outline-danger">Archive Room &#9888;</button>
      </form>
    </div>
  `;

  const chatCards = opts.allRooms.filter(r => r.kind === 'chat').map(renderCard).join('');
  const forumCards = opts.allRooms.filter(r => r.kind !== 'chat').map(renderCard).join('');

  return `
    <style>
      .rooms-section-title { font-size: 14px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin: 24px 0 12px; }
      .room-kind-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--border-color); color: var(--text-main); }
      .room-kind-chat { background: var(--primary); color: #fff; }
    </style>
    <div class="section-header">
      <h1 class="page-title">Rooms Management</h1>
      <button class="btn" onclick="document.getElementById('add-room-drawer').style.display='flex'">+ Add Room</button>
    </div>

    <h2 class="rooms-section-title">&#128172; Chat Rooms</h2>
    <div class="rooms-grid">${chatCards || '<p class="muted">No chat rooms.</p>'}</div>

    <h2 class="rooms-section-title">&#128203; Forum / Content Rooms</h2>
    <div class="rooms-grid">${forumCards}</div>

    <!-- Add Room Modal -->
    <div id="add-room-drawer"
         style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000; align-items:center; justify-content:center; padding:16px;"
         onclick="if(event.target===this) this.style.display='none'">
      <div style="background:var(--card-bg); border-radius:16px; width:100%; max-width:480px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,0.3);"
           onclick="event.stopPropagation()">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:18px 24px; border-bottom:1px solid var(--border-color); flex-shrink:0;">
          <h2 style="margin:0; font-size:17px; font-weight:800; color:var(--text-main);">Create New Room</h2>
          <button onclick="document.getElementById('add-room-drawer').style.display='none'"
                  style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:22px; line-height:1; padding:4px 8px; border-radius:8px;">&times;</button>
        </div>
        <div style="padding:20px 24px; overflow-y:auto; flex:1;">
          <form method="POST" action="/admin/room/create" class="drawer-form">
            ${csrfField(opts)}
            <div class="field">
              <label>Name</label>
              <input type="text" name="name" required placeholder="e.g. General Discussion" maxlength="64">
            </div>
            <div class="field">
              <label>Slug</label>
              <input type="text" name="slug" required pattern="[a-z0-9\\-]{2,32}" placeholder="e.g. general">
            </div>
            <div class="field">
              <label>Kind</label>
              <select name="kind" required>
                <option value="forum">Forum</option>
                <option value="blog">Blog</option>
                <option value="news">News</option>
                <option value="questions">Questions</option>
                <option value="chat">Chat</option>
              </select>
            </div>
            <div class="field">
              <label>Description</label>
              <textarea name="description" rows="3" placeholder="Briefly describe the room's purpose..." maxlength="500"></textarea>
            </div>
            <div class="field">
              <label>Icon (emoji)</label>
              <input type="text" name="icon" placeholder="e.g. 🏠" maxlength="8">
            </div>
            <div class="drawer-row">
              <div class="field">
                <label>Read Gate</label>
                <select name="min_read"><option value="anon">anon</option><option value="member" selected>member</option><option value="full">Trusted member</option><option value="mod">mod</option></select>
              </div>
              <div class="field">
                <label>Post Gate</label>
                <select name="min_post"><option value="member" selected>member</option><option value="full">Trusted member</option><option value="mod">mod</option></select>
              </div>
            </div>
            <div class="drawer-row">
              <div class="field">
                <label>Sort Order</label>
                <input type="number" name="sort_order" value="0" min="0">
              </div>
            </div>
            <div class="checkbox-group">
              <label><input type="checkbox" name="is_locked" value="1"> Locked</label>
              <label><input type="checkbox" name="is_page" value="1"> Has Page</label>
              <label><input type="checkbox" name="is_exclusive" value="1"> Exclusive (invite-only)</label>
            </div>
            <button type="submit" class="btn btn-block">Create Room</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function renderAccess(opts: { allRooms: Room[] }): string {
  const rooms = opts.allRooms;
  const rows = rooms.map(r => `
    <tr style="border-bottom:1px solid var(--border-color);">
      <td style="padding:12px 8px; font-weight:700; color:var(--text-main);">${esc(r.name)}</td>
      <td style="padding:12px 8px; color:var(--text-muted); font-size:13px;">${esc(r.slug)}</td>
      <td style="padding:12px 8px;">
        ${r.is_exclusive
          ? `<span style="background:var(--primary);color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;">Exclusive</span>`
          : `<span style="background:var(--bg-color);color:var(--text-muted);border:1px solid var(--border-color);border-radius:999px;padding:2px 8px;font-size:11px;">Open</span>`
        }
      </td>
      <td style="padding:12px 8px; text-align:right;">
        <button class="btn btn-sm" style="font-size:12px; padding:4px 10px;"
          hx-get="/r/${esc(r.slug)}/access"
          hx-target="body"
          hx-swap="beforeend">
          Manage
        </button>
      </td>
    </tr>
  `).join('');

  return `
    <h1 class="page-title">Room Access Control</h1>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px;">
      Manage per-room whitelists and blacklists. Enable Exclusive Mode on a room to restrict it to allowed members only.
    </p>
    <div class="card" style="padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:var(--bg-color);border-bottom:2px solid var(--border-color);">
            <th style="padding:12px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Room</th>
            <th style="padding:12px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Slug</th>
            <th style="padding:12px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Mode</th>
            <th style="padding:12px 8px;"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" style="padding:20px;color:var(--text-muted);text-align:center;">No rooms found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

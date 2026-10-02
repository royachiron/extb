import { esc, csrfField } from './layout';
import type { Room, RoomPermissionRow } from '../types';

const READ_OPTS = [
  { v: 'anon',   l: '🌐 Everyone' },
  { v: 'member', l: '👥 Members' },
  { v: 'full',   l: '⭐ Full Members' },
  { v: 'mod',    l: '🛡️ Mods only' },
] as const;

const POST_OPTS = [
  { v: 'member', l: '👥 Members' },
  { v: 'full',   l: '⭐ Full Members' },
  { v: 'mod',    l: '🛡️ Mods only' },
] as const;

const LEVEL_OPTS = [
  { v: 'full',    l: '✅ Full access' },
  { v: 'read',    l: '👁 Read only' },
  { v: 'blocked', l: '🚫 Blocked' },
] as const;

function levelBadge(raw: string): string {
  // handle legacy values from before migration
  const level = raw === 'allow' ? 'full' : raw === 'deny' ? 'blocked' : raw;
  const style = level === 'blocked'
    ? 'background:var(--danger); color:#fff;'
    : level === 'read'
    ? 'background:var(--border-color); color:var(--text-main);'
    : 'background:var(--primary); color:#fff;';
  const label = level === 'blocked' ? '🚫 Blocked'
    : level === 'read' ? '👁 Read only'
    : '✅ Full access';
  return `<span style="padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700; white-space:nowrap; ${style}">${label}</span>`;
}

export function renderRoomAccessControl(opts: {
  room: Room;
  permissions: RoomPermissionRow[];
  users?: { display_name: string | null }[];
  csrfToken?: string;
  error?: string;
}): string {
  const { room, permissions, users = [], csrfToken, error } = opts;
  const excl = !!room.is_exclusive;

  const readOpts = READ_OPTS.map(o =>
    `<option value="${o.v}"${room.min_read === o.v ? ' selected' : ''}>${o.l}</option>`
  ).join('');

  const postOpts = POST_OPTS.map(o =>
    `<option value="${o.v}"${room.min_post === o.v ? ' selected' : ''}>${o.l}</option>`
  ).join('');

  const addLevelOpts = LEVEL_OPTS.map(o =>
    `<option value="${o.v}">${o.l}</option>`
  ).join('');

  const permRows = permissions.length === 0
    ? `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px; font-style:italic;">No overrides - everyone follows rank defaults.</div>`
    : permissions.map(p => `
      <div style="display:grid; grid-template-columns:1fr auto 36px; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid var(--border-color);">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          <div style="width:26px; height:26px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; flex-shrink:0;">${esc((p.display_name?.[0] ?? 'U').toUpperCase())}</div>
          <span style="font-size:13px; font-weight:600; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.display_name || `user#${p.user_id}`)}</span>
        </div>
        ${levelBadge(p.access_type)}
        <button
          hx-delete="/r/${esc(room.slug)}/access/user/${p.id}"
          hx-target="#room-access-modal"
          hx-swap="outerHTML"
          title="Remove"
          style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:20px; line-height:1; padding:4px 6px; border-radius:6px; flex-shrink:0;">×</button>
      </div>`
    ).join('');

  const selectStyle = `width:100%; padding:7px 10px; border:1.5px solid var(--border-color); border-radius:8px; background:var(--card-bg); color:var(--text-main); font-size:13px; font-weight:600; cursor:pointer;`;

  return `
<div id="room-access-modal"
     style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000; align-items:center; justify-content:center; padding:16px;"
     onclick="if(event.target===this)this.remove()">
  <div style="background:var(--card-bg); border-radius:16px; width:100%; max-width:540px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,0.3);"
       onclick="event.stopPropagation()">

    <div style="display:flex; align-items:center; gap:12px; padding:18px 24px; border-bottom:1px solid var(--border-color); flex-shrink:0;">
      <h2 style="flex:1; font-size:17px; font-weight:800; color:var(--text-main); margin:0;">🛡️ Room Access - ${esc(room.name)}</h2>
      <button onclick="document.getElementById('room-access-modal').remove()"
              style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:22px; line-height:1; padding:4px 8px; border-radius:8px; flex-shrink:0;">×</button>
    </div>

    <div style="padding:20px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:20px;">

      <!-- Rank floors + exclusive: one form, auto-saves on change -->
      <form hx-post="/r/${esc(room.slug)}/access/toggle" hx-target="#room-access-modal" hx-swap="outerHTML"
            style="display:flex; flex-direction:column; gap:12px;">
        ${csrfField({ csrfToken })}

        <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);">Default rank required</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:10px; padding:12px 14px;">
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">👁 Can Read</div>
            <select name="min_read" ${excl ? 'disabled' : ''} onchange="this.form.requestSubmit()"
                    style="${selectStyle} opacity:${excl ? '0.4' : '1'}; cursor:${excl ? 'not-allowed' : 'pointer'};">
              ${readOpts}
            </select>
          </div>
          <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:10px; padding:12px 14px;">
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">✏️ Can Post</div>
            <select name="min_post" ${excl ? 'disabled' : ''} onchange="this.form.requestSubmit()"
                    style="${selectStyle} opacity:${excl ? '0.4' : '1'}; cursor:${excl ? 'not-allowed' : 'pointer'};">
              ${postOpts}
            </select>
          </div>
        </div>

        <div style="background:var(--bg-color); border:1.5px solid ${excl ? 'var(--primary)' : 'var(--border-color)'}; border-radius:10px; padding:14px 16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:700; color:var(--text-main);">Exclusive / Invite-only</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px; line-height:1.4;">Rank floors ignored - only users listed below (Read or above) can enter</div>
            </div>
            <label class="toggle">
              <input type="checkbox" name="is_exclusive" value="1" ${excl ? 'checked' : ''}
                     onchange="this.form.requestSubmit()">
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </label>
          </div>
          ${excl ? `
          <div style="margin-top:10px; padding:8px 12px; border-radius:7px; background:var(--primary); color:#fff; font-size:12px; font-weight:700;">
            ⚠️ Active - rank floors ignored. Access controlled entirely by the list below.
          </div>` : ''}
        </div>
      </form>

      <!-- User overrides -->
      <div>
        <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:10px;">User overrides</div>
        ${error ? `<div style="padding:8px 12px; background:var(--danger); color:#fff; border-radius:8px; font-size:13px; font-weight:600; margin-bottom:10px;">${esc(error)}</div>` : ''}
        <form hx-post="/r/${esc(room.slug)}/access/user" hx-target="#room-access-modal" hx-swap="outerHTML"
              style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          ${csrfField({ csrfToken })}
          <input type="text" name="display_name" placeholder="Search username…" required autocomplete="off"
                 list="room-access-user-list"
                 style="flex:1; min-width:140px; padding:9px 12px; border:1.5px solid var(--border-color); border-radius:8px; font-size:14px; background:var(--bg-color); color:var(--text-main);">
          <datalist id="room-access-user-list">
            ${users.filter(u => u.display_name).map(u => `<option value="${esc(u.display_name)}"></option>`).join('')}
          </datalist>
          <select name="access_level"
                  style="padding:9px 10px; border:1.5px solid var(--border-color); border-radius:8px; background:var(--bg-color); color:var(--text-main); font-size:13px; font-weight:600; cursor:pointer; flex-shrink:0;">
            ${addLevelOpts}
          </select>
          <button type="submit" class="btn" style="padding:9px 16px; flex-shrink:0;">+ Add</button>
        </form>

        <div style="border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">
          <div style="display:grid; grid-template-columns:1fr auto 36px; gap:10px; padding:8px 14px; background:var(--bg-color); border-bottom:1px solid var(--border-color);">
            <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted);">User</span>
            <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted);">Access level</span>
            <span></span>
          </div>
          ${permRows}
        </div>
      </div>

    </div>
  </div>
</div>`;
}

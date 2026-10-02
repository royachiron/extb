import { esc, csrfField } from '../layout';
import type { CwTag } from '../../types';

export function renderWarnings(opts: { cwTags?: CwTag[]; csrfToken?: string }): string {
  const tags = opts.cwTags ?? [];
  const rows = tags.map(t => `
    <tr>
      <td><span class="cw-pill" style="background:${esc(t.color)};">${esc(t.name)}</span></td>
      <td><code>${esc(t.slug)}</code></td>
      <td>${t.is_spoiler ? '🟦 spoiler' : ''}${t.is_nsfw ? ' 🔞 nsfw' : ''}</td>
      <td style="font-size:12px;color:var(--text-muted);">${esc(t.description ?? '')}</td>
      <td style="text-align:right;">
        <form method="POST" action="/admin/cw-tag/${t.id}" hx-post="/admin/cw-tag/${t.id}" hx-swap="none" style="display:inline-flex;gap:4px;align-items:center;">
          ${csrfField(opts)}
          <input type="text" name="color" value="${esc(t.color)}" style="width:80px;padding:4px;">
          <input type="number" name="sort_order" value="${t.sort_order}" style="width:60px;padding:4px;">
          <label style="font-size:12px;white-space:nowrap;"><input type="checkbox" name="is_spoiler" value="1"${t.is_spoiler ? ' checked' : ''}> spoiler</label>
          <label style="font-size:12px;white-space:nowrap;"><input type="checkbox" name="is_nsfw" value="1"${t.is_nsfw ? ' checked' : ''}> nsfw</label>
          <button type="submit" class="btn btn-sm">Save</button>
        </form>
        <form method="POST" action="/admin/cw-tag/${t.id}/delete" hx-post="/admin/cw-tag/${t.id}/delete" hx-swap="none" style="display:inline;" onsubmit="return confirm('Delete this tag? Attached posts will lose this warning.');">
          ${csrfField(opts)}
          <button type="submit" class="btn btn-sm btn-danger">Delete</button>
        </form>
      </td>
    </tr>
  `).join('');

  return `
    <h1 class="page-title">Content Warning Tags</h1>
    <p style="color:var(--text-muted);font-size:14px;margin:0 0 16px;">Curated CW/TW/NSFW tags. Members and mods attach these to posts; viewers see colored pills and optional spoiler-blur. NSFW-flagged content hides for viewers who haven't enabled "Show NSFW" in their settings.</p>
    <div class="card">
      <table class="admin-table">
        <thead><tr><th>Tag</th><th>Slug</th><th>Flags</th><th>Description</th><th style="text-align:right;">Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="empty-state">No tags yet.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:16px;padding:24px;">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:20px;">Add new tag</h2>
      <form method="POST" action="/admin/cw-tag" hx-post="/admin/cw-tag" hx-swap="none" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        ${csrfField(opts)}
        <div class="field"><label>Slug <small style="color:var(--text-muted);">(a-z, 0-9, dash)</small><input type="text" name="slug" required pattern="[a-z0-9-]{2,40}"></div>
        <div class="field"><label>Name<input type="text" name="name" required maxlength="64"></label></div>
        <div class="field"><label>Color<input type="text" name="color" value="#6b7280" pattern="#[0-9a-fA-F]{6}"></label></div>
        <div class="field"><label>Sort order<input type="number" name="sort_order" value="500" min="0" max="9999"></label></div>
        <div class="field" style="grid-column:1/3;"><label>Description<textarea name="description" rows="2"></textarea></label></div>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" name="is_spoiler" value="1"> Spoiler-blur the post</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" name="is_nsfw" value="1"> NSFW (gated by viewer setting)</label>
        <button type="submit" class="btn" style="grid-column:1/3;">Create tag</button>
      </form>
    </div>
  `;
}

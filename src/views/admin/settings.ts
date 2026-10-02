import { BRANDING_KEYS, brandingFromSettings } from '../../lib/branding';
import { esc, csrfField } from '../layout';
import type { Setting } from '../../types';

export function renderSettings(opts: { settings: Setting[]; csrfToken?: string }): string {
  const visibleSettings = opts.settings.filter(s => ['signups_open', 'bot_enabled'].includes(s.key));
  const rows = visibleSettings.map(s => {
    const desc = '';

    return `
      <div class="card setting-card">
        <div class="setting-info">
          <div class="setting-key">${esc(s.key)}</div>
          <div class="setting-desc">${esc(desc)}</div>
        </div>
        <form method="POST" action="/admin/setting" hx-post="/admin/setting" hx-swap="none">
          ${csrfField(opts)}
          <input type="hidden" name="key" value="${esc(s.key)}">
          <div style="display:flex; gap:8px;">
            <input type="text" name="value" value="${esc(s.value)}" class="input-small">
            <button type="submit" class="btn btn-small">Save</button>
          </div>
        </form>
      </div>
    `;
  }).join('');

  const branding = brandingFromSettings(opts.settings);
  const fields = BRANDING_KEYS.map(key => `<label style="display:block;margin-bottom:14px;">${esc(key.replace(/_/g, ' '))}${key === 'rules' || key === 'homepage_copy' ? `<textarea name="${key}" rows="4">${esc(branding[key])}</textarea>` : `<input name="${key}" type="${key === 'accent_color' ? 'color' : key === 'contact_email' ? 'email' : key === 'logo_url' ? 'url' : 'text'}" value="${esc(branding[key])}">`}</label>`).join('');
  return `
    <section class="card"><h1>Community branding</h1><form method="POST" action="/admin/branding" hx-post="/admin/branding" hx-target=".main">${csrfField(opts)}${fields}<button class="btn" type="submit">Save branding</button></form></section>
    <h1 class="page-title">Advanced Settings</h1>
    <div class="settings-grid">
      ${rows || '<div class="card"><div class="empty-state">No advanced settings to edit.</div></div>'}
    </div>
  `;
}

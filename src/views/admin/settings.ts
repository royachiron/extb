import { HELPER_FIELDS, helperConfigFromSettings } from '../../lib/bot-copy';
import { BRANDING_KEYS, brandingFromSettings } from '../../lib/branding';
import { esc, csrfField } from '../layout';
import type { Setting } from '../../types';

export function renderSettings(opts: { settings: Setting[]; csrfToken?: string }): string {
  const visibleSettings = ['signups_open', 'bot_enabled'].map(key => opts.settings.find(setting => setting.key === key) ?? { key, value: '1' });
  const rows = visibleSettings.map(s => {
    const desc = s.key === 'bot_enabled' ? 'Enable the optional community helper' : 'Allow new registrations';

    return `
      <div class="card setting-card">
        <div class="setting-info">
          <div class="setting-key">${esc(s.key)}</div>
          <div class="setting-desc"><!--extb-ui-->${esc(desc)}</div>
        </div>
        <form method="POST" action="/admin/setting" hx-post="/admin/setting" hx-swap="none">
          ${csrfField(opts)}
          <input type="hidden" name="key" value="${esc(s.key)}">
          <div style="display:flex; gap:8px;">
            <input type="hidden" name="value" value="0"><label><input type="checkbox" name="value" value="1"${s.value !== '0' ? ' checked' : ''}> <span><!--extb-ui-->Enabled</span></label>
            <button type="submit" class="btn btn-small">Save</button>
          </div>
        </form>
      </div>
    `;
  }).join('');

  const branding = brandingFromSettings(opts.settings);
  const fields = BRANDING_KEYS.map(key => `<label style="display:block;margin-bottom:14px;">${esc(key.replace(/_/g, ' '))}${key === 'rules' || key === 'homepage_copy' ? `<textarea name="${key}" rows="4">${esc(branding[key])}</textarea>` : `<input name="${key}" type="${key === 'accent_color' ? 'color' : key === 'contact_email' ? 'email' : key === 'logo_url' ? 'url' : 'text'}" value="${esc(branding[key])}">`}</label>`).join('');
  const helper = helperConfigFromSettings(opts.settings);
  const guidanceLabels = { intro: 'Introduction guidance', topic: 'Topic guidance', reply: 'Reply guidance', room: 'Room guidance', quiet: 'Participation guidance' };
  const helperFields = HELPER_FIELDS.map(key => `<label><!--extb-ui-->${guidanceLabels[key]}<textarea name="${key}" rows="3" maxlength="4000" required>${esc(helper[key])}</textarea></label>`).join('');
  return `
    <section class="card"><h2><!--extb-ui-->Membership review</h2><p><a href="/admin/membership-settings"><!--extb-ui-->Configure optional membership review, welcome messages, and reminders</a></p></section>
    <section class="card"><h2><!--extb-ui-->Community helper guidance</h2><p><!--extb-ui-->The helper is optional. Use bot_enabled below to enable or disable it. Guidance is plain text.</p><form method="POST" action="/admin/helper-settings" hx-post="/admin/helper-settings" hx-swap="none">${csrfField(opts)}<label><!--extb-ui-->Helper name<input name="name" maxlength="80" required value="${esc(helper.name)}"></label>${helperFields}<button class="btn" type="submit"><!--extb-ui-->Save helper guidance</button></form></section>
    <section class="card"><h1>Community branding</h1><form method="POST" action="/admin/branding" hx-post="/admin/branding" hx-target=".main">${csrfField(opts)}${fields}<button class="btn" type="submit">Save branding</button></form></section>
    <h1 class="page-title">Advanced Settings</h1>
    <div class="settings-grid">
      ${rows || '<div class="card"><div class="empty-state">No advanced settings to edit.</div></div>'}
    </div>
  `;
}

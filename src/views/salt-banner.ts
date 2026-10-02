// One-off banner shown to users whose row still has password_salt = NULL.
// Lazy migration runs on next successful login (see src/api/auth.ts), so the
// banner just nudges the user to log out and back in (or reset password).
// Dismissible via localStorage for the rest of the session.

const SALT_BANNER_CSS = `
<style>
  .salt-banner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; margin: 0 0 16px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.55); border-radius: 12px; color: var(--text-main); font-size: 14px; line-height: 1.5; }
  .salt-banner-text { flex: 1; min-width: 220px; }
  .salt-banner-text strong { display: block; margin-bottom: 2px; }
  .salt-banner-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .salt-banner-cta { padding: 7px 14px; background: var(--primary); color: white; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; text-decoration: none; display: inline-block; }
  .salt-banner-cta.secondary { background: transparent; color: var(--text-main); border: 1px solid var(--border, rgba(0,0,0,0.15)); }
  .salt-banner-cta:hover { filter: brightness(1.05); }
  .salt-banner-dismiss { background: none; border: none; color: var(--text-muted, #888); font-size: 18px; cursor: pointer; padding: 0 4px; }
</style>
`;

export function renderSaltUpgradeBanner(): string {
  return `
    ${SALT_BANNER_CSS}
    <div class="salt-banner" id="salt-banner" hidden>
      <div class="salt-banner-text">
        <strong>🔐 Small security upgrade pending on your account.</strong>
        <span>Log out and back in once to apply (takes 5 seconds). No urgency &mdash; your account works fine in the meantime.</span>
      </div>
      <div class="salt-banner-actions">
        <a href="/logout" class="salt-banner-cta">Log out</a>
        <a href="/reset" class="salt-banner-cta secondary">Reset password</a>
      </div>
      <button type="button" class="salt-banner-dismiss" id="salt-banner-dismiss" aria-label="Dismiss">&times;</button>
    </div>
    <script>
      (function() {
        var KEY = 'salt-banner-dismissed-v1';
        var el = document.getElementById('salt-banner');
        if (!el) return;
        try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}
        el.hidden = false;
        var btn = document.getElementById('salt-banner-dismiss');
        if (btn) btn.addEventListener('click', function() {
          el.hidden = true;
          try { localStorage.setItem(KEY, '1'); } catch (_) {}
        });
      })();
    </script>
  `;
}

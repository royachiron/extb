import { csrfField, esc } from './layout';
import { timezoneOptions } from './profile';
import { renderTosPill } from './tos';
import type { User } from '../types';
import { uniqueNamesGenerator, adjectives, animals, colors } from 'unique-names-generator';

function generateNameSuggestions(count: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  while (results.length < count) {
    const name = uniqueNamesGenerator({
      dictionaries: [adjectives, animals],
      style: 'capital',
      separator: '',
    });
    if (!seen.has(name) && name.length <= 32) {
      seen.add(name);
      results.push(name);
    }
  }
  return results;
}

function errorBlock(error?: string): string {
  return error ? `<p class="error" role="alert" style="background:#fee2e2; color:#b91c1c; padding:12px; border-radius:6px; margin-bottom:16px; border:1px solid #fecaca;">${esc(error)}</p>` : '';
}

// Cloudflare Turnstile (CAPTCHA) widget. Renders empty when no site key is
// configured; the persistent layout script explicitly renders widgets after
// initial load and HTMX swaps.
function turnstileWidget(siteKey?: string, invisible?: boolean): string {
  if (!siteKey) return '';
  const appearance = invisible ? ' data-appearance="interaction-only"' : '';
  return `<div style="margin-top:16px;"><div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-size="flexible"${appearance}></div></div>`;
}

export function renderRegister(opts: { error?: string; csrfToken?: string; siteKey?: string; invite?: string; emailEnabled?: boolean } = {}): string {
  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 24px; font-size:28px; font-weight:800;"><!--extb-ui-->Register<!--/extb-ui--></h1>
      ${errorBlock(opts.error)}
      <form method="post" action="/register" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField(opts)}
        <input type="hidden" name="invite" value="${esc(opts.invite || '')}">
        <label><!--extb-ui-->Username <!--/extb-ui--><input name="display_name" required minlength="3" maxlength="32" autocomplete="username"></label>
        ${opts.invite ? '' : `
        <div style="margin-bottom:16px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Email<!--/extb-ui--></label>
          <input type="email" name="email" autocomplete="email" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
          <p style="margin:6px 0 0; font-size:12px; color:var(--text-muted); line-height:1.5;"><!--extb-ui-->An email verification link activates your account.<!--/extb-ui--></p>
        </div>
        `}
        <div style="margin-bottom:16px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Password (min 8 chars)<!--/extb-ui--></label>
          <input type="password" name="password" required minlength="8" autocomplete="new-password" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
        </div>
        <div style="margin-bottom:20px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" name="is_adult" style="width:18px; height:18px;">
            <span style="font-size:14px; font-weight:500;"><!--extb-ui-->I am 18 or older<!--/extb-ui--></span>
          </label>
        </div>
        <div style="margin-bottom:20px;">
          ${renderTosPill()}
        </div>
        ${turnstileWidget(opts.siteKey)}
        <button type="submit" id="register-submit" class="btn" style="width:100%; padding:12px; font-size:16px; margin-top:16px;" disabled><!--extb-ui-->Create Account<!--/extb-ui--></button>
        <p style="margin:8px 0 0; text-align:center; font-size:12px; color:var(--text-muted);"><!--extb-ui-->Read and accept the Community Guidelines above to enable.<!--/extb-ui--></p>
      </form>
      <p style="margin-top:20px; text-align:center; color:var(--text-muted); font-size:14px;"><!--extb-ui-->Already have an account? <!--/extb-ui--><a href="/login" style="color:var(--primary); font-weight:600;"><!--extb-ui-->Log in<!--/extb-ui--></a></p>
    </div>
  `;
}

export function renderRegistrationClosed(): string {
  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 16px; font-size:28px; font-weight:800;"><!--extb-ui-->Registration Closed<!--/extb-ui--></h1>
      <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <p style="margin:0; color:var(--text-muted); line-height:1.6;"><!--extb-ui-->New accounts are not being accepted right now.<!--/extb-ui--></p>
      </div>
      <p style="margin-top:20px; text-align:center; color:var(--text-muted); font-size:14px;"><!--extb-ui-->Already have an account? <!--/extb-ui--><a href="/login" style="color:var(--primary); font-weight:600;"><!--extb-ui-->Log in<!--/extb-ui--></a></p>
    </div>
  `;
}

export function renderLogin(opts: { error?: string; csrfToken?: string; siteKey?: string } = {}): string {
  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 24px; font-size:28px; font-weight:800;"><!--extb-ui-->Log in<!--/extb-ui--></h1>
      ${errorBlock(opts.error)}
      <form method="post" action="/login" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField(opts)}
        <div style="margin-bottom:16px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Email or Username<!--/extb-ui--></label>
          <input type="text" name="email" required autocomplete="username" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
        </div>
        <div style="margin-bottom:24px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Password<!--/extb-ui--></label>
          <input type="password" name="password" required autocomplete="current-password" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
        </div>
        ${turnstileWidget(opts.siteKey)}
        <button type="submit" class="btn" style="width:100%; padding:12px; font-size:16px; margin-top:16px;"><!--extb-ui-->Log in<!--/extb-ui--></button>
      </form>
      <p style="margin-top:20px; text-align:center; color:var(--text-muted); font-size:14px;">
        <a href="/register" style="color:var(--primary); font-weight:600;"><!--extb-ui-->Register<!--/extb-ui--></a> &middot;
        <a href="/reset" style="color:var(--text-muted);"><!--extb-ui-->Forgot password?<!--/extb-ui--></a>
      </p>
    </div>
  `;
}

export function renderVerifySent(opts: { email?: string; csrfToken?: string; siteKey?: string } = {}): string {
  const { email = '', csrfToken = '', siteKey } = opts;
  return `
    <div style="max-width:480px; margin:40px auto; text-align:center;">
      <h1 style="font-size:28px; font-weight:800; margin-bottom:16px;"><!--extb-ui-->Check your email<!--/extb-ui--></h1>
      <p style="font-size:16px; color:var(--text-muted); line-height:1.6;"><!--extb-ui-->We've sent a verification link to your email address. Click it to activate your account.<!--/extb-ui--></p>
      <p style="margin-top:8px; font-size:14px; color:var(--text-muted);"><!--extb-ui-->Check your spam folder if you don't see it.<!--/extb-ui--></p>
      <form method="POST" action="/resend-verification" style="margin-top:28px; display:flex; flex-direction:column; gap:10px; align-items:center;">
        ${csrfField({ csrfToken })}
        <label style="width:100%; text-align:left; font-size:13px; font-weight:600; color:var(--text-muted);"><!--extb-ui-->Resend to<!--/extb-ui--></label>
        <input type="email" name="email" value="${esc(email)}" placeholder="your@email.com" required
          style="width:100%; padding:10px 12px; border:1px solid var(--border-color); border-radius:8px; font-size:15px; background:var(--bg-color); color:var(--text-main);">
        ${turnstileWidget(siteKey)}
        <button type="submit" class="btn" style="width:100%; justify-content:center;"><!--extb-ui-->Resend verification email<!--/extb-ui--></button>
      </form>
      <p style="margin-top:24px; font-size:14px; color:var(--text-muted);"><!--extb-ui-->Already verified? <!--/extb-ui--><a href="/login" style="color:var(--primary); font-weight:600;"><!--extb-ui-->Log in<!--/extb-ui--></a></p>
    </div>
  `;
}

export function renderResetRequest(opts: { error?: string; csrfToken?: string; siteKey?: string } = {}): string {
  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 24px; font-size:28px; font-weight:800;"><!--extb-ui-->Reset password<!--/extb-ui--></h1>
      ${errorBlock(opts.error)}
      <form method="post" action="/reset-request" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField(opts)}
        <div style="margin-bottom:24px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Email or Username<!--/extb-ui--></label>
          <input type="text" name="email" required autocomplete="username" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
        </div>
        ${turnstileWidget(opts.siteKey)}
        <button type="submit" class="btn" style="width:100%; padding:12px; font-size:16px; margin-top:16px;"><!--extb-ui-->Send reset link<!--/extb-ui--></button>
      </form>
    </div>
  `;
}

export function renderResetSent(): string {
  return `
    <div style="max-width:480px; margin:40px auto; text-align:center;">
      <h1 style="font-size:28px; font-weight:800; margin-bottom:16px;"><!--extb-ui-->Check your email<!--/extb-ui--></h1>
      <p style="font-size:16px; color:var(--text-muted); line-height:1.6;"><!--extb-ui-->If your account has email recovery enabled, we have sent a reset link. Otherwise, ask your community administrator for a private reset link.<!--/extb-ui--></p>
    </div>
  `;
}

export function renderResetForm(token: string, error?: string, csrfToken?: string): string {
  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 24px; font-size:28px; font-weight:800;"><!--extb-ui-->Choose new password<!--/extb-ui--></h1>
      ${errorBlock(error)}
      <form method="post" action="/reset" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField({ csrfToken })}
        <input type="hidden" name="token" value="${esc(token)}">
        <div style="margin-bottom:24px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->New password (min 8 chars)<!--/extb-ui--></label>
          <input type="password" name="password" required minlength="8" autocomplete="new-password" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px;">
        </div>
        <button type="submit" class="btn" style="width:100%; padding:12px; font-size:16px;"><!--extb-ui-->Update password<!--/extb-ui--></button>
      </form>
    </div>
  `;
}

export function renderResetDone(): string {
  return `
    <div style="max-width:480px; margin:40px auto; text-align:center;">
      <h1 style="font-size:28px; font-weight:800; margin-bottom:16px;">Password updated</h1>
      <p style="font-size:16px; color:var(--text-muted); margin-bottom:24px;"><!--extb-ui-->Your password has been successfully reset.<!--/extb-ui--></p>
      <a href="/login" class="btn" style="padding:12px 24px; font-size:16px; text-decoration:none;"><!--extb-ui-->Log in now<!--/extb-ui--></a>
    </div>
  `;
}

export function renderOnboarding(opts?: { note?: string; noteIsUi?: boolean }): string {
  return `<h1><!--extb-ui-->Welcome<!--/extb-ui--></h1><p>${opts?.note ? (opts.noteIsUi ? '<!--extb-ui-->' + esc(opts.note) + '<!--/extb-ui-->' : esc(opts.note)) : '<!--extb-ui-->Your community is ready. Join a conversation or introduce yourself.<!--/extb-ui-->'}</p><a href="/forum"><!--extb-ui-->Explore rooms<!--/extb-ui--></a> · <a href="/membership"><!--extb-ui-->Membership status<!--/extb-ui--></a>`;
}

export function renderProfileSetup(opts: { error?: string; user: User; csrfToken?: string; userBadges?: any[]; allBadges?: any[] }): string {
  const { error, user, csrfToken, userBadges = [], allBadges = [] } = opts;
  return `
    <div style="max-width:600px; margin:0 auto;">
      <h1 style="margin:0 0 12px; font-size:28px; font-weight:800;"><!--extb-ui-->Set up your profile<!--/extb-ui--></h1>
      <p style="margin:0 0 24px; color:var(--text-muted);"><!--extb-ui-->Welcome! Please choose your public identity. Your display name is <!--/extb-ui--><strong><!--extb-ui-->permanent<!--/extb-ui--></strong>.</p>
      
      ${errorBlock(opts.error)}
      
      <form method="post" action="/profile-setup" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField(opts)}
        
        <div style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Display name<!--/extb-ui--></label>
          <input id="display-name-input" type="text" name="display_name" required pattern="[a-zA-Z0-9_\\-]{3,32}" minlength="3" maxlength="32" placeholder="Pick one below or type your own" data-extb-i18n-placeholder="Pick one below or type your own" style="width:100%; padding:10px 12px; font-size:15px; border:1px solid var(--border-color); border-radius:6px; transition:border-color 0.2s;">
          <p style="margin:4px 0 0; font-size:12px; color:var(--text-muted);"><!--extb-ui-->3-32 chars, letters/numbers/underscore/hyphen only. <!--/extb-ui--><strong><!--extb-ui-->Permanent after saving.<!--/extb-ui--></strong></p>
          <div id="name-suggestions" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
            ${generateNameSuggestions(30).map(n => `<button type="button" class="name-chip" onclick="document.getElementById('display-name-input').value='${n}';document.querySelectorAll('.name-chip').forEach(c=>c.classList.remove('selected'));this.classList.add('selected')">${n}</button>`).join('')}
          </div>
          <button type="button" onclick="shuffleChips()" style="margin-top:8px; font-size:12px; color:var(--primary); background:none; border:none; cursor:pointer; padding:0; font-weight:600;"><!--extb-ui-->+ More suggestions<!--/extb-ui--></button>
        </div>
        <style>
          .name-chip { padding:6px 14px; border-radius:9999px; border:1.5px solid var(--border-color); background:var(--bg-color); color:var(--text-main); font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; }
          .name-chip:hover { border-color:var(--primary); color:var(--primary); }
          .name-chip.selected { border-color:var(--primary); background:var(--primary); color:#fff; }
          #name-suggestions .name-chip:nth-child(n+11) { display:none; }
        </style>
        <script>
          var _chipOffset = 0;
          var _chips = Array.from(document.querySelectorAll('.name-chip'));
          function shuffleChips() {
            _chips.forEach(function(c, i) { c.style.display = 'none'; });
            _chipOffset = (_chipOffset + 10) % _chips.length;
            for (var i = 0; i < 10; i++) { _chips[(_chipOffset + i) % _chips.length].style.display = ''; }
          }
        </script>

        <div style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Bio <!--/extb-ui--><span style="font-weight:400; color:var(--text-muted); font-size:13px;"><!--extb-ui-->(optional)<!--/extb-ui--></span></label>
          <textarea name="bio" maxlength="500" rows="3" style="width:100%; padding:10px 12px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; resize:vertical;"></textarea>
        </div>

        <div style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;"><!--extb-ui-->Timezone<!--/extb-ui--></label>
          <select name="timezone" style="width:100%; padding:10px 12px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; background:var(--card-bg);">
            ${timezoneOptions('UTC')}
          </select>
          <p style="margin:4px 0 0; font-size:12px; color:var(--text-muted);"><!--extb-ui-->Used for chat timestamps and post dates.<!--/extb-ui--></p>
        </div>

        <button type="submit" class="btn" style="width:100%; padding:12px; font-size:16px;"><!--extb-ui-->Finish setup<!--/extb-ui--></button>
      </form>


    </div>
  `;
}

export function renderAppeal(opts: { error?: string; success?: boolean; csrfToken?: string } = {}): string {
  if (opts.success) {
    return `
      <div style="max-width:480px; margin:40px auto; text-align:center;">
        <h1 style="font-size:28px; font-weight:800; margin-bottom:16px;">Appeal submitted</h1>
        <p style="font-size:16px; color:var(--text-muted); line-height:1.6;">Your appeal has been sent to the moderation team. We will review it as soon as possible.</p>
        <p style="margin-top:24px;"><a href="/" class="btn"><!--extb-ui-->Return Home<!--/extb-ui--></a></p>
      </div>
    `;
  }

  return `
    <div style="max-width:480px; margin:0 auto;">
      <h1 style="margin:0 0 12px; font-size:28px; font-weight:800;">Appeal Ban</h1>
      <p style="margin:0 0 24px; color:var(--text-muted);">If you believe your ban was a mistake or have improved your behavior, please explain why you should be unbanned.</p>
      
      ${errorBlock(opts.error)}
      
      <form method="post" action="/appeal" style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        ${csrfField(opts)}
        
        <div style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:8px;">Reason for appeal</label>
          <textarea name="reason" required minlength="20" maxlength="2000" rows="6" placeholder="I understand why I was banned, and..." style="width:100%; padding:10px 12px; border:1px solid var(--border-color); border-radius:6px; font-family:inherit; resize:vertical;"></textarea>
          <p style="margin:4px 0 0; font-size:12px; color:var(--text-muted);">Min 20 chars, max 2000 chars.</p>
        </div>

        <button type="submit" class="btn" style="width:100%; padding:12px; font-size:16px;">Submit Appeal</button>
      </form>
    </div>
  `;
}

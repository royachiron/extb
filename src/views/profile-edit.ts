import { esc, csrfField, timeTag } from './layout';
import { renderBadgeIcon } from '../lib/badges';
import { avatarHtml, timezoneOptions } from './user-bits';
import { userSidebar, DASHBOARD_STYLE } from './profile-shared';
import type { User, WarningWithReplies } from '../types';

export function renderBadgeSearchResults(opts: { results: any[]; userBadges: any[]; csrfToken?: string }): string {
  const { results, userBadges, csrfToken } = opts;
  if (!results.length) {
    return `<div style="padding:12px;color:var(--text-muted);font-size:13px;">No badges match.</div>`;
  }
  return results.map(b => {
    const ownedBadge = userBadges.find(ub => ub.id === b.id);
    const owned = !!ownedBadge;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--border-color);border-radius:10px;margin-bottom:6px;background:var(--card-bg);">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span class="badge" style="background:${esc(b.color)};color:${esc(b.text_color || '#ffffff')};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;" title="${esc(b.description ?? '')}">${renderBadgeIcon(b.icon)} ${esc(b.name)}</span>
          <span style="color:var(--text-muted);font-size:12px;">${esc(b.description ?? '')}</span>
        </span>
        <form hx-post="/settings/badges/add" hx-target="#assigned-badges" hx-swap="outerHTML" style="margin:0;display:flex;align-items:center;gap:8px;">
          ${csrfField({ csrfToken })}
          <input type="hidden" name="badge_id" value="${b.id}">
          <input type="hidden" name="status" value="have">
          <button type="submit" class="btn btn-sm">${owned ? 'Update' : 'Add'}</button>
        </form>
      </div>`;
  }).join('');
}

export function renderAssignedBadgeList(opts: { userBadges: any[]; csrfToken?: string }): string {
  const { csrfToken } = opts;
  const userBadges = opts.userBadges;

  const pills = userBadges.length
    ? userBadges.map(b => {
        const tc = esc(b.text_color || '#ffffff');
        const statusLabel = '';
        return `
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 12px;border-radius:999px;background:${esc(b.color)};color:${tc};font-size:13px;font-weight:700;">
          ${renderBadgeIcon(b.icon)} ${esc(b.name)}${statusLabel}
          <form hx-post="/settings/badges/remove" hx-target="#assigned-badges" hx-swap="outerHTML" style="margin:0;display:inline;">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="badge_id" value="${b.id}">
            <button type="submit" title="Remove" data-extb-i18n-title="Remove" style="background:rgba(0,0,0,0.18);border:none;color:${tc};width:20px;height:20px;border-radius:50%;font-size:12px;line-height:1;cursor:pointer;font-weight:900;">×</button>
          </form>
        </span>`;
      }).join('')
    : `<span style="color:var(--text-muted);font-size:13px;font-style:italic;">No badges yet. Search above and click Add.</span>`;
  return `<div id="assigned-badges" style="display:flex;flex-wrap:wrap;gap:8px;min-height:32px;padding:12px;border:1px dashed var(--border-color);border-radius:12px;background:var(--bg-color);">${pills}</div>`;
}

export function renderProfileEdit(opts: { user: User; error?: string; csrfToken?: string; userBadges?: any[]; allBadges?: any[] }): string {
  const { user, error, csrfToken, userBadges = [], allBadges = [] } = opts;
  const avatarUrl = (user as any).avatar_url;


  const formContent = `
    <h1 class="page-title"><!--extb-ui-->Account Settings<!--/extb-ui--></h1>
    ${error ? `<div class="flash flash-warn" style="margin-bottom:24px;">${esc(error)}</div>` : ''}
    
    <form method="POST" action="/settings/profile" hx-post="/settings/profile" hx-swap="none" style="display:flex; flex-direction:column; gap:32px;">
      ${csrfField({ csrfToken })}
      
      <div class="card" style="border-radius:24px;">
        <h2 style="font-size:20px; font-weight:800; color:var(--text-main); margin-bottom:24px; border-bottom:2px solid #f3f4f6; padding-bottom:12px;"><!--extb-ui-->Public Identity<!--/extb-ui--></h2>
        
        <div class="form-group" style="margin-bottom:32px;">
          <label class="form-label"><!--extb-ui-->Profile Picture<!--/extb-ui--></label>
          <div style="display:flex; align-items:center; gap:20px;">
            <div id="avatar-preview-wrap">
              ${avatarHtml(user.display_name ?? '?', user.avatar_color ?? '#6366f1', 80, avatarUrl)}
            </div>
            <div>
              <button type="button" class="btn btn-secondary btn-sm profile-upload" onclick="triggerAvatarUpload()"><!--extb-ui-->Change Photo<!--/extb-ui--></button>
              ${avatarUrl ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('avatar_url_input').value='';document.getElementById('avatar-preview-wrap').innerHTML='${avatarHtml(user.display_name ?? '?', user.avatar_color ?? '#6366f1', 80, null).replace(/'/g, "\\'")}';"><!--extb-ui-->Remove<!--/extb-ui--></button>` : ''}
              <p class="form-hint" style="margin-top:8px;">Max 3MB. Resized to 256x256.</p>
              <input type="hidden" name="avatar_url" id="avatar_url_input" value="${esc(avatarUrl || '')}">
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:32px;">
          <label class="form-label"><!--extb-ui-->Cover Image<!--/extb-ui--></label>
          <div id="cover-preview-wrap" style="height:140px; border-radius:12px; background-size:cover; background-position:center; background-color:var(--bg-color); border:1px solid var(--border-color); margin-bottom:12px; ${user.cover_image ? `background-image:url('${esc(user.cover_image)}');` : `background-image:linear-gradient(135deg, ${esc(user.avatar_color || '#6366f1')}, #000);`}"></div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm profile-upload" onclick="triggerCoverUpload()"><!--extb-ui-->Upload Cover<!--/extb-ui--></button>
            ${user.cover_image ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('cover_image_input').value='';document.getElementById('cover-preview-wrap').style.backgroundImage='linear-gradient(135deg, ${esc(user.avatar_color || '#6366f1')}, #000)';"><!--extb-ui-->Remove<!--/extb-ui--></button>` : ''}
            <span class="form-hint" style="margin:0;">Max 3MB. Wide image works best (1500x500).</span>
          </div>
          <input type="hidden" name="cover_image" id="cover_image_input" value="${esc(user.cover_image || '')}">
        </div>

        <div class="form-group">
          <label class="form-label"><!--extb-ui-->Display name <!--/extb-ui--><span style="font-weight:400; color:var(--text-muted); font-size:12px;">(Permanent)</span></label>
          <div style="padding:12px 16px; background:var(--bg-color); border:2px solid var(--border-color); border-radius:12px; color:var(--text-muted); font-weight:700;">${esc(user.display_name ?? '')}</div>
        </div>

        <div class="form-group">
          <label class="form-label"><!--extb-ui-->Preferred Pronouns<!--/extb-ui--></label>
          <input type="text" name="pronouns" value="${esc(user.pronouns || '')}" maxlength="20" placeholder="e.g. they/them">
        </div>

        <div class="form-group">
          <label class="form-label"><!--extb-ui-->Personal Bio<!--/extb-ui--></label>
          <textarea name="bio" rows="4" maxlength="500" placeholder="Tell the community a bit about yourself...">${esc(user.bio ?? '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Forum Signature</label>
          <textarea name="signature" rows="3" maxlength="300" placeholder="Appear at the bottom of your posts...">${esc(user.signature ?? '')}</textarea>
          <p class="form-hint">Supports Markdown. Max 300 characters.</p>
        </div>

        <div class="form-group">
          <label class="form-label"><!--extb-ui-->Local Timezone<!--/extb-ui--></label>
          <select name="timezone">
            ${timezoneOptions(user.timezone)}
          </select>
          <p class="form-hint">Used to display chat and post times in your local time.</p>
        </div>

      </div>

      <div class="card" style="border-radius:24px;">
        <h2 style="font-size:20px; font-weight:800; color:var(--text-main); margin-bottom:24px; border-bottom:2px solid #f3f4f6; padding-bottom:12px;"><!--extb-ui-->Social & Privacy<!--/extb-ui--></h2>
        
        <div class="form-group">
          <label class="form-label">Twitter / X Profile URL</label>
          <input type="url" name="twitter_url" value="${esc(user.twitter_url || '')}" maxlength="100" placeholder="https://twitter.com/username">
        </div>

        <div class="form-group">
          <label class="form-label"><!--extb-ui-->Personal Website<!--/extb-ui--></label>
          <input type="url" name="website_url" value="${esc(user.website_url || '')}" maxlength="100" placeholder="https://example.com">
        </div>

        <div style="display:flex; flex-direction:column; gap:20px; margin-top:12px;">
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" name="hide_activity" value="1" ${user.hide_activity ? 'checked' : ''} style="width:20px; height:20px;">
            <span style="font-size:15px; font-weight:600;">Hide recent activity from my public profile</span>
          </label>
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" name="hide_bio" value="1" ${user.hide_bio ? 'checked' : ''} style="width:20px; height:20px;">
            <span style="font-size:15px; font-weight:600;">Hide bio from my public profile</span>
          </label>
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" name="allow_dms" value="1" ${(user as any).allow_dms !== 0 ? 'checked' : ''} style="width:20px; height:20px;">
            <span style="font-size:15px; font-weight:600;"><!--extb-ui-->Allow others to start direct messages with me<!--/extb-ui--></span>
          </label>
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" name="show_nsfw" value="1" ${user.show_nsfw ? 'checked' : ''} style="width:20px; height:20px;">
            <span style="font-size:15px; font-weight:600;">Show NSFW &mdash; reveal posts tagged NSFW. Default off.</span>
          </label>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-start; align-items:center; margin-top:16px;">
        <button type="submit" class="btn" style="padding:14px 40px; font-size:16px;"><!--extb-ui-->Save Account Changes<!--/extb-ui--></button>
      </div>
    </form>

    <div class="card" style="border-radius:24px; margin-top:32px;">
      <h2 style="font-size:20px; font-weight:800; color:var(--text-main); margin-bottom:8px; border-bottom:2px solid #f3f4f6; padding-bottom:12px;">Disability Badges</h2>
      <p class="form-hint" style="margin-bottom:20px;"><!--extb-ui-->Search and add badges. They appear under your profile picture on posts.<!--/extb-ui--></p>

      <div class="form-group">
        <label class="form-label"><!--extb-ui-->Your Badges<!--/extb-ui--></label>
        ${renderAssignedBadgeList({ userBadges, csrfToken })}
      </div>


      <div class="form-group" style="margin-top:20px;">
        <label class="form-label" for="badge-search-input"><!--extb-ui-->Search Badges<!--/extb-ui--></label>
        <div style="display:flex; gap:8px; align-items:stretch;">
          <input
            type="search"
            id="badge-search-input"
            name="q"
            placeholder="Type abbreviation or description (e.g. LBK, blind, deaf)…"
            autocomplete="off"
            hx-get="/api/badges/search"
            hx-trigger="input changed delay:200ms, focus"
            hx-target="#badge-search-results"
            hx-swap="innerHTML"
            style="flex:1;"
          >
        </div>
        <div id="badge-search-results" style="margin-top:12px;"></div>
      </div>
    </div>

    <form method="POST" action="/settings/profile" hx-post="/settings/profile" hx-swap="none" style="display:flex; flex-direction:column; gap:32px; margin-top:32px;">
      ${csrfField({ csrfToken })}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button type="button" class="btn btn-outline-danger" onclick="if(confirm('Permanently delete your account? This cannot be undone.')) document.getElementById('delete-form').requestSubmit()"><!--extb-ui-->Delete My Account<!--/extb-ui--></button>
      </div>
    </form>
    
    <form id="delete-form" method="POST" action="/settings/delete" hx-post="/settings/delete" hx-swap="none" style="display:none;">
      ${csrfField({ csrfToken })}
    </form>
  `;

  return `
    ${DASHBOARD_STYLE}
    <div class="admin-layout">
      ${userSidebar('settings', user.display_name || undefined, true)}
      <div class="admin-content">
        <div class="breadcrumb">My Account &gt; <span><!--extb-ui-->Settings<!--/extb-ui--></span></div>
        ${formContent}
      </div>
    </div>
  `;
}

export function renderWarningsTab(opts: {
  user: User;
  warnings: WarningWithReplies[];
  csrfToken?: string;
}): string {
  const { user, warnings, csrfToken } = opts;
  const unresolvedCount = warnings.filter(w => !w.resolved_at).length;

  // A chat bubble. side 'left' = Boterator (the mod team, masked); 'right' = the warned user.
  function bubble(side: 'left' | 'right', name: string, raw: string, bodyHtml: string): string {
    const isLeft = side === 'left';
    const radius = isLeft ? '4px 16px 16px 16px' : '16px 4px 16px 16px';
    const avatar = isLeft
      ? `<span style="flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--primary);font-size:16px;">🤖</span>`
      : '';
    return `
      <div style="display:flex; gap:8px; align-items:flex-start; justify-content:${isLeft ? 'flex-start' : 'flex-end'};">
        ${avatar}
        <div style="max-width:80%; min-width:0;">
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:3px; ${isLeft ? '' : 'text-align:right;'}">${esc(name)} &middot; ${timeTag(raw)}</div>
          <div style="padding:10px 14px; border-radius:${radius}; background:${isLeft ? 'var(--card-bg)' : 'var(--primary)'}; color:${isLeft ? 'var(--text-main)' : '#fff'}; border:1px solid var(--border-color); font-size:14px; white-space:pre-wrap; word-wrap:break-word;">${bodyHtml}</div>
        </div>
      </div>
    `;
  }

  function openingBody(w: WarningWithReplies): string {
    const memoText = (w.internal_memo || '').trim() || 'A moderator issued a warning regarding your content.';
    const tc = (w.target_content || '').trim();
    const quoted = tc ? tc.slice(0, 240) + (tc.length > 240 ? '…' : '') : '';
    return `${esc(memoText)}${quoted ? `<div style="margin-top:10px; padding:8px 12px; border-left:3px solid var(--border-color); background:var(--bg-color); color:var(--text-muted); border-radius:6px; font-size:13px; font-style:italic;">Regarding: ${esc(quoted)}</div>` : ''}`;
  }

  function thread(w: WarningWithReplies): string {
    const rows = [bubble('left', 'Boterator', w.created_at, openingBody(w))];
    for (const r of w.replies) {
      const isUserReply = r.user_id === user.id;
      rows.push(bubble(
        isUserReply ? 'right' : 'left',
        isUserReply ? 'You' : 'Boterator',
        r.created_at,
        esc(r.content),
      ));
    }
    return `<div style="display:flex; flex-direction:column; gap:12px; margin:16px 0;">${rows.join('')}</div>`;
  }

  function resolvedNote(w: WarningWithReplies): string {
    if (!w.resolved_at) return '';
    return `<div style="text-align:center; margin-top:8px; padding:10px; font-size:13px; color:var(--text-muted);">✓ This thread was resolved by the moderation team.${w.resolve_memo ? `<div style="margin-top:6px;">${esc(w.resolve_memo)}</div>` : ''}</div>`;
  }

  function replyForm(w: WarningWithReplies): string {
    if (w.resolved_at) return '';
    const lastReply = w.replies[w.replies.length - 1];
    const userAlreadyReplied = lastReply && lastReply.user_id === user.id;

    if (userAlreadyReplied) {
      return `<p style="font-size:13px; color:var(--text-muted); margin-top:12px; font-style:italic;">Awaiting moderator response.</p>`;
    }

    return `
      <form method="POST" action="/api/warnings/${w.id}/reply" style="margin-top:16px; display:flex; flex-direction:column; gap:10px;" data-warning-reply-form>
        ${csrfField({ csrfToken })}
        <textarea name="content" rows="3" maxlength="1000" placeholder="Write your reply..." required
          style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-color); color:var(--text-main); font-size:14px; resize:vertical; box-sizing:border-box;"></textarea>
        <div>
          <button type="button" class="btn btn-sm" data-warning-reply-confirm style="padding:8px 20px; font-size:13px;"><!--extb-ui-->Send Reply<!--/extb-ui--></button>
        </div>
        <div data-warning-reply-confirm-prompt style="display:none; padding:12px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:8px;">
          <p style="margin:0 0 10px; font-size:14px; color:var(--text-main); font-weight:600;">Is this all you have to say?</p>
          <div style="display:flex; gap:8px;">
            <button type="submit" class="btn btn-sm" style="padding:8px 20px; font-size:13px;"><!--extb-ui-->Confirm<!--/extb-ui--></button>
            <button type="button" class="btn btn-secondary btn-sm" data-warning-reply-cancel style="padding:8px 20px; font-size:13px;"><!--extb-ui-->Cancel<!--/extb-ui--></button>
          </div>
        </div>
      </form>
    `;
  }

  const warningCards = warnings.length === 0
    ? `<div class="card" style="border-radius:20px; padding:48px; text-align:center;">
        <div style="font-size:48px; margin-bottom:16px;">✅</div>
        <h2 style="font-size:20px; font-weight:800; color:var(--text-main); margin-bottom:8px;"><!--extb-ui-->No warnings<!--/extb-ui--></h2>
        <p style="color:var(--text-muted);">Your account is in good standing.</p>
      </div>`
    : warnings.map(w => {
        const resolved = !!w.resolved_at;
        const statusColor = resolved ? 'var(--text-muted)' : 'var(--danger)';
        const statusText = resolved ? 'Resolved' : 'Active';

        return `
          <div class="card" style="border-radius:20px; padding:24px; margin-bottom:16px; border-left:4px solid ${statusColor}; opacity:${resolved ? '0.85' : '1'};">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:12px; border-bottom:1px solid var(--border-color);">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:var(--primary);font-size:18px;">🤖</span>
                <div>
                  <div style="font-size:15px; font-weight:800; color:var(--text-main);">Boterator</div>
                  <div style="font-size:12px; color:var(--text-muted);">Moderation notice</div>
                </div>
              </div>
              <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:${statusColor};">${statusText}</span>
            </div>
            ${thread(w)}
            ${replyForm(w)}
            ${resolvedNote(w)}
          </div>
        `;
      }).join('');

  const mainContent = `
    <h1 class="page-title">Warnings${unresolvedCount > 0 ? ` <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:var(--danger);color:#fff;font-size:14px;font-weight:800;vertical-align:middle;">${unresolvedCount}</span>` : ''}</h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">Messages from the moderation team about your content or behaviour. Reply directly in any thread - the team will see it.</p>
    ${warningCards}
  `;

  return `
    ${DASHBOARD_STYLE}
    <div class="admin-layout">
      ${userSidebar('warnings', user.display_name || undefined, true, unresolvedCount)}
      <div class="admin-content">
        <div class="breadcrumb">My Account &gt; <span><!--extb-ui-->Warnings<!--/extb-ui--></span></div>
        ${mainContent}
      </div>
    </div>
  `;
}


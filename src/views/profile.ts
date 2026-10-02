import { renderBadgeIcon } from '../lib/badges';
import { marked } from 'marked';
import { esc, csrfField, initials, timeTag } from './layout';
export { initials };
import type { User, Room, WarningWithReplies } from '../types';
import { isMod, isAdmin } from '../access';
import { renderReportButton, renderReportSlot } from './report';
import type { ProfileTopicRow, ProfilePostRow } from '../types';

// Canonical home for these is views/user-bits.ts; re-exported here because
// dms.ts/admin.ts/users.ts import them via profile.
export { AVATAR_PALETTE, avatarHtml, badgeHtml, TIMEZONES, timezoneOptions } from './user-bits';
import { avatarHtml, badgeHtml, timezoneOptions } from './user-bits';
import { userSidebar, DASHBOARD_STYLE } from './profile-shared';

function modActionsCard(viewer: User, target: User, csrfToken?: string): string {
  const adminViewer = isAdmin(viewer);
  const banned = target.is_banned === 1;
  const ACCESS_LEVELS = ['member', 'full', 'mod', 'admin'];
  return `
    <div class="card" style="padding:24px; border-radius:20px; margin-top:20px; border:2px solid var(--danger);">
      <h2 style="font-size:16px; font-weight:800; color:var(--danger); margin:0 0 16px;">Mod Actions</h2>
      <div style="display:flex; flex-direction:column; gap:12px;">

        <form method="POST" action="/admin/user/ban">
          ${csrfField({ csrfToken })}
          <input type="hidden" name="user_id" value="${target.id}">
          <input type="hidden" name="is_banned" value="${banned ? '0' : '1'}">
          <button type="submit" class="${banned ? 'btn btn-secondary' : 'btn btn-danger'}" style="width:100%;">
            ${banned ? 'Unban User' : 'Ban User'}
          </button>
        </form>

        ${adminViewer ? `
        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.05em;">Access Level</label>
          <form method="POST" action="/admin/user/access" style="display:flex; gap:8px;">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="user_id" value="${target.id}">
            <select name="access_level" style="flex:1; padding:8px 10px; border:1px solid var(--border-color); border-radius:8px; font-size:14px; background:var(--bg-color); color:var(--text-main);">
              ${ACCESS_LEVELS.map(l => `<option value="${l}"${target.access_level === l ? ' selected' : ''}>${l === 'full' ? 'Trusted member' : l}</option>`).join('')}
            </select>
            <button type="submit" class="btn" style="flex-shrink:0;"><!--extb-ui-->Save<!--/extb-ui--></button>
          </form>
        </div>

        <form method="POST" action="/admin/user/delete">
          ${csrfField({ csrfToken })}
          <input type="hidden" name="user_id" value="${target.id}">
          <button type="button" data-confirm class="btn btn-danger" style="width:100%; background:none; color:var(--danger); border:2px solid var(--danger);">
            Delete Account
          </button>
        </form>

        <button onclick="document.getElementById('edit-user-drawer-${target.id}').classList.add('open')" class="btn" style="width:100%; background:var(--text-main); color:var(--bg-color); margin-top:12px;">
          🛠️ Admin Edit Profile
        </button>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
          <form method="POST" action="/admin/user/update">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="user_id" value="${target.id}">
            <input type="hidden" name="remove_avatar" value="1">
            <button type="submit" class="btn btn-sm btn-secondary" style="width:100%; font-size:12px;">Remove Pic</button>
          </form>
          <form method="POST" action="/admin/user/update">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="user_id" value="${target.id}">
            <input type="hidden" name="remove_cover" value="1">
            <button type="submit" class="btn btn-sm btn-secondary" style="width:100%; font-size:12px;">Remove Cover</button>
          </form>
        </div>

        <!-- Admin Edit User Drawer -->
        <div id="edit-user-drawer-${target.id}" class="drawer-overlay" onclick="if(event.target===this) this.classList.remove('open')">
          <div class="drawer-content" role="dialog" aria-modal="true" aria-labelledby="edit-user-drawer-${target.id}-title">
            <div class="drawer-header">
              <h2 id="edit-user-drawer-${target.id}-title">Edit ${esc(target.display_name || target.email)}</h2>
              <button type="button" onclick="document.getElementById('edit-user-drawer-${target.id}').classList.remove('open')" class="drawer-close" aria-label="Close">&times;</button>
            </div>
            <form method="POST" action="/admin/user/update" hx-post="/admin/user/update" class="drawer-form">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="user_id" value="${target.id}">

              <div class="drawer-body">
                <section class="drawer-section">
                  <h3 class="drawer-section-title"><!--extb-ui-->Identity<!--/extb-ui--></h3>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-display_name"><!--extb-ui-->Display Name<!--/extb-ui--></label>
                    <input id="edu-${target.id}-display_name" type="text" name="display_name" value="${esc(target.display_name || '')}" maxlength="32">
                  </div>
                  <div class="drawer-row">
                    <div class="drawer-field">
                      <label for="edu-${target.id}-pronouns"><!--extb-ui-->Pronouns<!--/extb-ui--></label>
                      <input id="edu-${target.id}-pronouns" type="text" name="pronouns" value="${esc(target.pronouns || '')}" maxlength="32" placeholder="they/them">
                    </div>
                    <div class="drawer-field">
                      <label for="edu-${target.id}-avatar_color">Avatar Color</label>
                      <input id="edu-${target.id}-avatar_color" type="color" name="avatar_color" value="${target.avatar_color || '#6366f1'}">
                    </div>
                  </div>
                  <div class="drawer-checkbox-group">
                    <label><input type="checkbox" name="remove_avatar" value="1"><!--extb-ui--> Remove Profile Picture<!--/extb-ui--></label>
                    <label><input type="checkbox" name="remove_cover" value="1"><!--extb-ui--> Remove Cover Image<!--/extb-ui--></label>
                  </div>
                </section>

                <section class="drawer-section">
                  <h3 class="drawer-section-title"><!--extb-ui-->Profile<!--/extb-ui--></h3>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-bio"><!--extb-ui-->Bio<!--/extb-ui--></label>
                    <textarea id="edu-${target.id}-bio" name="bio" rows="3" maxlength="500">${esc(target.bio || '')}</textarea>
                    <span class="drawer-field-hint">Up to 500 characters. Shown on the public profile.</span>
                  </div>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-signature">Signature (Markdown)</label>
                    <textarea id="edu-${target.id}-signature" name="signature" rows="2" maxlength="300">${esc(target.signature || '')}</textarea>
                  </div>
                </section>

                <section class="drawer-section">
                  <h3 class="drawer-section-title">Links</h3>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-website_url"><!--extb-ui-->Website<!--/extb-ui--></label>
                    <input id="edu-${target.id}-website_url" type="url" name="website_url" value="${esc(target.website_url || '')}" placeholder="https://...">
                  </div>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-twitter_url">Twitter</label>
                    <input id="edu-${target.id}-twitter_url" type="url" name="twitter_url" value="${esc(target.twitter_url || '')}" placeholder="https://twitter.com/...">
                  </div>
                </section>

                <section class="drawer-section">
                  <h3 class="drawer-section-title"><!--extb-ui-->Moderation<!--/extb-ui--></h3>
                  <div class="drawer-field">
                    <label for="edu-${target.id}-mod_note">Mod Note (private)</label>
                    <textarea id="edu-${target.id}-mod_note" name="mod_note" rows="3" placeholder="Admin-only notes about this user...">${esc(target.mod_note || '')}</textarea>
                    <span class="drawer-field-hint">Visible only to moderators and admins.</span>
                  </div>
                  <div class="drawer-checkbox-group">
                    <label><input type="checkbox" name="hide_activity" value="1" ${target.hide_activity ? 'checked' : ''}><!--extb-ui--> Hide activity from public profile<!--/extb-ui--></label>
                    <label><input type="checkbox" name="hide_bio" value="1" ${target.hide_bio ? 'checked' : ''}><!--extb-ui--> Hide bio from public profile<!--/extb-ui--></label>
                  </div>
                </section>
              </div>

              <div class="drawer-footer">
                <button type="button" class="btn-ghost" onclick="document.getElementById('edit-user-drawer-${target.id}').classList.remove('open')"><!--extb-ui-->Cancel<!--/extb-ui--></button>
                <button type="submit" class="btn-primary"><!--extb-ui-->Save Changes<!--/extb-ui--></button>
              </div>
            </form>
          </div>
        </div>
        ` : ''}

      </div>
    </div>
  `;
}

export function renderProfile(opts: {
  user: User | null;
  rooms: Room[];
  profileUser: User;
  recentTopics: ProfileTopicRow[];
  recentPosts: ProfilePostRow[];
  counts: { topics: number, posts: number };
  badges?: any[];
  csrfToken?: string;
}): string {
  const { user, profileUser, recentTopics, recentPosts, counts, badges } = opts;
  const isSelf = !!user && user.id === profileUser.id;
  // hide_activity is user-facing privacy only - admins still see history for mod work
  const canSeeActivity = isSelf || !profileUser.hide_activity || isAdmin(user);
  const topicsHtml = recentTopics.length
    ? recentTopics.map(t => `
        <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border-color);">
          <a href="/t/${t.short_id}" hx-get="/t/${t.short_id}" hx-target=".main" hx-push-url="true" style="color:var(--text-main); font-weight:700; font-size:16px; display:block; margin-bottom:4px;">${esc(t.title)}</a>
          <div style="color:var(--text-muted); font-size:13px;">in <strong>${esc(t.room_name)}</strong> &middot; <span class="rel-time" data-utc="${t.created_at.replace(' ', 'T') + 'Z'}">${esc(t.created_at)}</span></div>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted);"><!--extb-ui-->No topics yet.<!--/extb-ui--></p>';

  const postsHtml = recentPosts.length
    ? recentPosts.map(p => `
        <div style="margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border-color);">
          <a href="/t/${p.topic_short_id}#post-${p.id}" hx-get="/t/${p.topic_short_id}" hx-target=".main" hx-push-url="true" style="color:var(--primary); font-weight:700; font-size:14px; display:block; margin-bottom:6px;">Re: ${esc(p.topic_title)}</a>
          <div style="color:var(--text-main); font-size:14px; line-height:1.6; background:var(--bg-color); padding:12px; border-radius:8px; border-left:3px solid var(--border-color);">${esc(p.content.slice(0, 200))}${p.content.length > 200 ? '...' : ''}</div>
          <div style="margin-top:8px; color:var(--text-muted); font-size:12px;"><span class="rel-time" data-utc="${p.created_at.replace(' ', 'T') + 'Z'}">${esc(p.created_at)}</span></div>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted);"><!--extb-ui-->No replies yet.<!--/extb-ui--></p>';

  const bioHtml = profileUser.hide_bio && !isSelf
    ? '<p style="font-style:italic; color:var(--text-muted); background:var(--card-bg); padding:16px; border-radius:12px; border:1px solid var(--border-color);"><!--extb-ui-->This user has hidden their bio.<!--/extb-ui--></p>'
    : profileUser.bio
      ? `<div style="line-height:1.7; color:var(--text-main); font-size:16px; white-space:pre-wrap;">${esc(profileUser.bio)}</div>`
      : '<p style="font-style:italic; color:var(--text-muted);"><!--extb-ui-->No bio provided yet.<!--/extb-ui--></p>';

  const twitterHtml = profileUser.twitter_url ? `<a href="${esc(profileUser.twitter_url)}" target="_blank" class="btn-secondary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.904 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg> Twitter</a>` : '';
  const websiteHtml = profileUser.website_url ? `<a href="${esc(profileUser.website_url)}" target="_blank" class="btn-secondary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><!--extb-ui--> Website<!--/extb-ui--></a>` : '';
  const collapsedBadges = (badges || []);
  const haveBadges = collapsedBadges;
  const needBadges: any[] = [];

  const renderBadgePill = (b: any) => `<span class="badge" style="background:${esc(b.color)};color:${esc(b.text_color || '#ffffff')};" title="${esc(b.description)}">${renderBadgeIcon(b.icon)} ${esc(b.name)}</span>`;

  const haveList = haveBadges.map(renderBadgePill).join('');
  const needList = needBadges.map(renderBadgePill).join('');

  const mainContent = `
    <style>
      .profile-card { background:var(--card-bg); border:1px solid var(--border-color); border-radius:24px; overflow:hidden; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05); }
      .profile-cover { height:180px; }
      .profile-body { padding:0 40px 40px; position:relative; }
      .profile-avatar-wrap { position:absolute; top:-70px; left:40px; border:8px solid var(--card-bg); border-radius:50%; background:var(--card-bg); box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); }
      .profile-header { margin-left:172px; padding-top:20px; display:flex; flex-direction:column; gap:20px; }
      .profile-grid { margin-top:56px; display:grid; grid-template-columns: 2fr 1fr; gap:48px; }
      @media (max-width: 768px) {
        .profile-card { border-radius:16px; }
        .profile-cover { height:120px; }
        .profile-body { padding:0 16px 24px; }
        .profile-avatar-wrap { top:-44px; left:50%; transform:translateX(-50%); border-width:4px; }
        .profile-avatar-wrap > * { width:88px !important; height:88px !important; font-size:32px !important; }
        .profile-header { margin-left:0; padding-top:52px; align-items:center; text-align:center; }
        .profile-grid { margin-top:24px; grid-template-columns:1fr; gap:24px; }
        .profile-body section { margin-bottom:24px !important; }
        .profile-body h2 { font-size:18px !important; margin-bottom:12px !important; }
        .profile-header > div:first-child > div:first-child { justify-content: center; }
      }
    </style>
    <div class="profile-card">
      <div class="profile-cover" style="${(profileUser as any).cover_image
        ? `background-image:url('${esc((profileUser as any).cover_image)}'); background-size:cover; background-position:center;`
        : `background:linear-gradient(135deg, ${esc(profileUser.avatar_color || '#6366f1')}, #000); opacity:0.8;`
      }"></div>
      <div class="profile-body">
        <div class="profile-avatar-wrap">
          ${avatarHtml(profileUser.display_name ?? '?', profileUser.avatar_color ?? '#6366f1', 140, (profileUser as any).avatar_url)}
        </div>

        <div class="profile-header">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px;">
              <h1 style="margin:0; font-size:32px; font-weight:900; color:var(--text-main); letter-spacing:-0.03em; word-break:break-word;">${esc(profileUser.display_name ?? '(no name)')}</h1>
              ${badgeHtml(profileUser.access_level)}
              
              <div style="margin-left:auto; display:flex; gap:8px;">
                ${isSelf ? `<a href="/settings/profile" hx-get="/settings/profile" hx-target=".main" hx-push-url="true" class="btn btn-secondary"><!--extb-ui-->Edit Profile<!--/extb-ui--></a>` : ''}
                ${!isSelf ? `
                  <div id="profile-actions" style="display:flex; gap:8px;">
                    ${(user?.access_level === 'admin' || (profileUser as any).allow_dms !== 0) ? `<a href="/dms/new?to=${encodeURIComponent(profileUser.display_name ?? '')}" class="btn"><!--extb-ui-->Message<!--/extb-ui--></a>` : ''}
                    <button class="btn btn-secondary"
                      hx-post="/u/${esc(profileUser.display_name || `user${profileUser.id}`)}/block"
                      hx-target="#profile-actions"
                      hx-swap="outerHTML">
                      ${(profileUser as any).is_blocked ? 'Unblock' : 'Block'}
                    </button>
                    ${user && !['mod', 'admin'].includes(user.access_level) ? renderReportButton('user', profileUser.id) : ''}
                  </div>
                ` : ''}
              </div>
            </div>
            ${!isSelf && user && !['mod', 'admin'].includes(user.access_level) ? renderReportSlot('user', profileUser.id) : ''}
            
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px;">
              ${profileUser.pronouns ? `<span style="font-size:13px; font-weight:600; color:var(--text-main); background:var(--border-color); padding:2px 10px; border-radius:999px;">${esc(profileUser.pronouns)}</span>` : ''}
              <span style="font-size:14px; color:var(--text-main);">Joined: ${new Date(profileUser.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            </div>
            
            ${haveList || needList ? `
            <div style="display:flex; gap:16px; margin-top:24px; flex-wrap:wrap; align-items:flex-start;">
              ${haveList ? `
              <div style="flex:1; min-width:200px; border:1px solid var(--border-color); border-radius:12px; padding:12px;">
                <div style="font-size:11px; font-weight:800; color:var(--text-main); margin-bottom:8px; letter-spacing:0.05em;">BADGES</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${haveList}</div>
              </div>
              ` : ''}
              
              ${needList ? `
              <div style="flex:1; min-width:200px; border:1px solid var(--border-color); border-radius:12px; padding:12px;">
                <div style="font-size:11px; font-weight:800; color:var(--text-main); margin-bottom:8px; letter-spacing:0.05em;">NEED</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${needList}</div>
              </div>
              ` : ''}
            </div>
            ` : ''}
          </div>
        </div>

        <div class="profile-grid">
          <div>
            <section style="margin-bottom:48px;">
              <h2 style="font-size:22px; font-weight:800; color:var(--text-main); margin-bottom:20px; letter-spacing:-0.02em;"><!--extb-ui-->About<!--/extb-ui--></h2>
              ${bioHtml}
              <div style="display:flex; gap:12px; margin-top:24px;">
                ${twitterHtml}
                ${websiteHtml}
              </div>
            </section>

            <section>
              <h2 style="font-size:22px; font-weight:800; color:var(--text-main); margin-bottom:24px; letter-spacing:-0.02em;"><!--extb-ui-->Recent Activity<!--/extb-ui--></h2>
              ${!canSeeActivity ? '<p style="font-style:italic; color:var(--text-muted); background:var(--card-bg); padding:16px; border-radius:12px; border:1px solid var(--border-color);"><!--extb-ui-->This user has hidden their activity.<!--/extb-ui--></p>' : `
                ${profileUser.hide_activity && !isSelf && isAdmin(user) ? '<p style="font-size:12px; font-style:italic; color:var(--text-muted); margin:0 0 16px;">Activity hidden from public - visible to you as admin.</p>' : ''}
                <div style="margin-bottom:40px;">
                  <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:20px; font-weight:800;"><!--extb-ui-->Latest Topics<!--/extb-ui--></h3>
                  <div class="profile-topics">${topicsHtml}</div>
                </div>
                <div>
                  <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:20px; font-weight:800;"><!--extb-ui-->Latest Replies<!--/extb-ui--></h3>
                  <div class="profile-posts">${postsHtml}</div>
                </div>
              `}
            </section>
          </div>

          <aside>
            <div class="card" style="padding:24px; border-radius:20px;">
              <h2 style="font-size:18px; font-weight:800; color:var(--text-main); margin-bottom:20px;">Platform Stats</h2>
              <div style="display:flex; flex-direction:column; gap:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:var(--text-muted); font-size:14px; font-weight:600;"><!--extb-ui-->Topics Started<!--/extb-ui--></span>
                  <strong style="color:var(--primary); font-size:20px; font-weight:900;">${counts.topics}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:var(--text-muted); font-size:14px; font-weight:600;"><!--extb-ui-->Community Replies<!--/extb-ui--></span>
                  <strong style="color:var(--primary); font-size:20px; font-weight:900;">${counts.posts}</strong>
                </div>
                <div style="margin-top:12px; padding-top:20px; border-top:1px solid var(--border-color);">
                  <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">Active participant in <strong>this community</strong>.</div>
                </div>
              </div>
            </div>
            ${!isSelf && user && isMod(user) ? modActionsCard(user, profileUser, opts.csrfToken) : ''}
          </aside>
        </div>
      </div>
    </div>
  `;

  return `
    ${DASHBOARD_STYLE}
    <div class="admin-layout">
      ${userSidebar('profile', profileUser.display_name || undefined, isSelf)}
      <div class="admin-content">
        <div class="breadcrumb">Profile &gt; <span>${esc(profileUser.display_name ?? 'User')}</span></div>
        ${mainContent}
      </div>
    </div>
  `;
}


// Settings/edit-tab renderers live in profile-edit.ts; re-exported here so
// existing '../views/profile' importers keep working.
export {
  renderBadgeSearchResults,
  renderAssignedBadgeList,
  renderProfileEdit,
  renderWarningsTab,
} from './profile-edit';

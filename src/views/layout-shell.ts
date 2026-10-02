import { DEFAULT_BRANDING, type Branding } from '../lib/branding';
import type { User, Room } from '../types';
import { canRead, isMod } from '../access';
import { esc, roomIcon, csrfField } from './layout-utils';

// Layout shell fragments extracted from ./layout renderLayout(). Each function
// returns the markup for one shell region byte-identically to the inline
// template it replaced - no reformatting, no renamed classes, no added esc().
//
// Anchoring rule (same as ./layout-utils): this module must NEVER import from
// './layout'. layout.ts points here, not the reverse. Pre-computed values
// (userMenu, cPanelLink) arrive as already-built strings so this file does not
// need './tos', './salt-banner', or the LayoutOpts shape.

export function renderTopnav(p: {
  branding?: Branding;
  user: User | null;
  verified: boolean;
  cPanelLink: string;
  userMenu: string;
}): string {
  const { user, verified, cPanelLink, userMenu } = p;
  return `<header class="topnav">
  <button class="hamburger" id="drawer-toggle" aria-label="Open menu" data-extb-i18n-aria-label="Open menu">
    <svg width="20" height="16" viewBox="0 0 20 16" fill="currentColor"><rect y="0" width="20" height="2" rx="1"/><rect y="7" width="20" height="2" rx="1"/><rect y="14" width="20" height="2" rx="1"/></svg>
  </button>
  <a href="/" hx-get="/" hx-target=".main" hx-push-url="true" class="brand" aria-label="${esc((p.branding ?? DEFAULT_BRANDING).name)}">${p.branding?.logo_url ? `<img src="${esc(p.branding.logo_url)}" alt="" style="width:120px;height:50px;object-fit:contain;vertical-align:middle;margin-inline-end:8px;">` : ''}<span class="brand-name">${esc((p.branding ?? DEFAULT_BRANDING).name)}</span></a>
  <nav aria-label="Primary" data-extb-i18n-aria-label="Primary">
    ${verified ? `<a href="/needs-you"><!--extb-ui-->Needs you<!--/extb-ui--></a>` : ''}
    ${verified ? `<a href="/users" hx-get="/users" hx-target=".main" hx-push-url="true"><!--extb-ui-->Members<!--/extb-ui--></a>` : ''}
    <a href="/chat" hx-get="/chat" hx-target=".main" hx-push-url="true" style="position:relative;"><!--extb-ui-->Chat <!--/extb-ui--><span class="js-chat-badge" style="position:absolute; top:-2px; right:-6px;"></span></a>
    ${user && verified ? `<a href="/dms" hx-get="/dms" hx-target=".main" hx-push-url="true" class="dm-nav-btn" id="dm-nav-btn" title="Inbox" data-extb-i18n-title="Inbox" aria-label="Direct messages" data-extb-i18n-aria-label="Direct messages" style="position:relative;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span id="dm-nav-badge-container" class="js-dm-badge"></span>
      </a>` : ''}
  </nav>
  ${verified ? `<form action="/search" method="GET" role="search" style="margin:0">
    <input name="q" placeholder="Search..." data-extb-i18n-placeholder="Search..." autocomplete="off" aria-label="Search" data-extb-i18n-aria-label="Search">
  </form>` : ''}
  <div class="right">
    ${cPanelLink ? `<div class="staff-nav">${cPanelLink}</div>` : ''}
    <button id="font-size-toggle" class="icon-btn" title="Text size" data-extb-i18n-title="Text size" aria-label="Change text size" data-extb-i18n-aria-label="Change text size" style="font-weight:800;font-size:15px;">Aa</button>
    <button id="dark-mode-toggle" class="icon-btn" title="Toggle Theme" data-extb-i18n-title="Toggle Theme" aria-label="Toggle dark mode" data-extb-i18n-aria-label="Toggle dark mode">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
    </button>
    <a class="language-switch" data-language="he" href="?lang=he" lang="he" hreflang="he">עברית</a><a class="language-switch" data-language="en" href="?lang=en" lang="en" hreflang="en">English</a>
    ${userMenu}
  </div>
</header>`;
}

// `rooms` is still needed alongside the pre-filtered arrays: the unread dot on
// "Most Recent" scans ALL rooms, and the logged-out branch does its own
// filter. canRead() is called per locked room to build the href, which a
// pre-filtered array cannot reproduce - hence the ../access import.
export function renderSidebar(p: {
  user: User | null;
  verified: boolean;
  rooms: Room[];
  memberRooms: Room[];
  lockedRooms: Room[];
  csrfToken?: string;
}): string {
  const { user, verified, rooms, memberRooms, lockedRooms, csrfToken } = p;
  const hasUnread = rooms.some((r) => (r.unread_count ?? 0) > 0);
  return `<aside class="sidebar" id="sidebar-drawer" aria-label="Rooms and pages" data-extb-i18n-aria-label="Rooms and pages">
    <button class="drawer-close" id="drawer-close" aria-label="Close menu" data-extb-i18n-aria-label="Close menu">&times;</button>
${'    '}
    ${verified ? `
    <h3><!--extb-ui-->Main<!--/extb-ui--></h3>
    <ul>
      <li><a href="/" hx-get="/" hx-target=".main" hx-push-url="true" title="Most Recent" data-extb-i18n-title="Most Recent">
          <span class="room-icon">🔥</span>
          <span class="room-label"><!--extb-ui-->Most Recent<!--/extb-ui--></span>
          ${hasUnread ? `<span class="unread-dot"></span>` : ''}
        </a>
      </li>
      ${user && hasUnread ? `<li>
        <form class="sidebar-read-all-form" method="POST" action="/threads/mark-read" hx-post="/threads/mark-read" hx-swap="none">
          ${csrfField({ csrfToken })}
          <button type="submit" class="sidebar-read-all-btn" title="Mark all threads read" data-extb-i18n-title="Mark all threads read" aria-label="Mark all threads read" data-extb-i18n-aria-label="Mark all threads read">
            <span class="room-icon"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 12 5 5L18 6"></path><path d="m13 16 2 2 7-7"></path></svg></span>
            <span class="room-label"><!--extb-ui-->Mark all read<!--/extb-ui--></span>
          </button>
        </form>
      </li>` : ''}
    </ul>

    <div class="sep"></div>

    <h3><!--extb-ui-->Rooms<!--/extb-ui--></h3>
    <ul>
      ${memberRooms
        .map((r) => `
          <li>
            <a href="/r/${esc(r.slug)}" hx-get="/r/${esc(r.slug)}" hx-target=".main" hx-push-url="true" title="${esc(r.name)}">
              <span class="room-icon">${roomIcon(r)}</span>
              <span class="room-label">${esc(r.name)}</span>
              ${(r.unread_count ?? 0) > 0 ? `<span class="unread-dot"></span>` : ''}
            </a>
          </li>`,
        )
        .join('')}
    </ul>

    ${lockedRooms.length > 0 ? `
    <div class="sep"></div>
    <h3><!--extb-ui-->Private<!--/extb-ui--></h3>
    <ul>
      ${lockedRooms.map(r => `
        <li>
          <a class="lock" href="${canRead(user, r) ? `/r/${esc(r.slug)}` : user ? '/r/introductions' : '/login'}" hx-get="${canRead(user, r) ? `/r/${esc(r.slug)}` : user ? '/r/introductions' : '/login'}" hx-target=".main" hx-push-url="true">
            <span class="room-icon">${roomIcon(r)}</span>
            <span class="room-label">${esc(r.name)}</span>
            <span style="font-size:12px; margin-left:auto;">🔒</span>
          </a>
        </li>`).join('')}
    </ul>` : ''}
    ` : `
    <h3><!--extb-ui-->Rooms<!--/extb-ui--></h3>
    <ul>
      ${rooms.filter(r => !r.is_page && !r.is_locked && (r.min_read === 'anon' || !r.min_read))
        .map(r => `
          <li>
            <a href="/r/${esc(r.slug)}" hx-get="/r/${esc(r.slug)}" hx-target=".main" hx-push-url="true" title="${esc(r.name)}">
              <span class="room-icon">${roomIcon(r)}</span>
              <span class="room-label">${esc(r.name)}</span>
            </a>
          </li>`).join('')}
    </ul>
    `}

    <div class="sep"></div>
    <h3><!--extb-ui-->Learn<!--/extb-ui--></h3>
    <ul>
      <li><a href="/tos" hx-get="/tos" hx-target=".main" hx-push-url="true"><span class="room-icon">📜</span><span class="room-label"><!--extb-ui-->Community Guidelines<!--/extb-ui--></span></a></li>
    </ul>
  </aside>`;
}

export function renderBottomNav(p: {
  user: User | null;
  verified: boolean;
  meHref: string;
}): string {
  const { user, verified, meHref } = p;
  return `<nav class="bottom-nav" aria-label="Main" data-extb-i18n-aria-label="Main">
  ${verified ? `
  <a href="/" class="bn-item" data-path="/">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg><!--extb-ui-->
    Feed
  <!--/extb-ui--></a>
  <a href="/needs-you" hx-get="/needs-you" hx-target=".main" hx-push-url="true" class="bn-item" data-path="/needs-you">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><!--extb-ui-->
    Needs you
  <!--/extb-ui--></a>` : `
  <a href="/about" hx-get="/about" hx-target=".main" hx-push-url="true" class="bn-item" data-path="/about">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    Q&amp;A
  </a>`}
  <a href="/chat" class="bn-item" data-path="/chat">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><!--extb-ui-->
    Chat
    <!--/extb-ui--><span class="bn-badge js-chat-badge"></span>
  </a>
  ${verified ? `
  <a href="/dms" class="bn-item" data-path="/dms">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><!--extb-ui-->
    DMs
    <!--/extb-ui--><span class="bn-badge js-dm-badge"></span>
  </a>` : ''}
  <a href="${meHref}" class="bn-item" data-path="${user ? '/u/' : '/login'}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    ${user ? '<!--extb-ui-->Me<!--/extb-ui-->' : '<!--extb-ui-->Login<!--/extb-ui-->'}
  </a>
</nav>`;
}

// showFab arrives already resolved (`opts.showFab !== false`) so the emit
// condition stays byte-identical to the inline original.
export function renderFab(p: {
  showFab: boolean;
  verified: boolean;
  activeRoomSlug?: string;
  fabHref: string;
}): string {
  const { showFab, verified, activeRoomSlug, fabHref } = p;
  return `${showFab && verified && !activeRoomSlug ? `<a href="${fabHref}" hx-get="${fabHref}" hx-target=".main" hx-push-url="true" class="fab" aria-label="New topic" data-extb-i18n-aria-label="New topic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></a>` : ''}`;
}

// Two sibling banners rendered back to back above the layout grid. Kept as
// separate functions because they are independent: the verify banner is gated
// on the logged-in-but-unverified state, the flash on an opts field.
export function renderVerifyBanner(p: {
  user: User | null;
  verified: boolean;
  csrfToken?: string;
}): string {
  const { user, verified, csrfToken } = p;
  return user && !verified
    ? `<div class="flash flash-warn" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
           <span><!--extb-ui-->Confirm your email to access the forum and all features.<!--/extb-ui--></span>
           <form method="POST" action="/resend-verification" style="margin:0;">
             ${csrfField({ csrfToken })}
             <button type="submit" class="btn" style="padding:4px 12px;font-size:13px;"><!--extb-ui-->Resend verification email<!--/extb-ui--></button>
           </form>
         </div>`
    : '';
}

export function renderFlash(p: { flash?: string }): string {
  const { flash } = p;
  return flash ? `<div class="flash">${esc(flash)}</div>` : '';
}

// The avatar button below hand-rolls its own <img>/initials branch instead of
// calling avatarHtml() (./profile). That is deliberate: avatarHtml emits a
// <span>, i.e. different markup. Converging the two is a separate signed-off
// change, not part of this move.
export function renderUserMenu(p: {
  user: User | null;
  userInitials: string;
  csrfToken?: string;
}): string {
  const { user, userInitials, csrfToken } = p;
  return user
    ? `
       <div class="user-menu notification-menu">
         <button class="icon-btn" title="Notifications" data-extb-i18n-title="Notifications" aria-label="Notifications" data-extb-i18n-aria-label="Notifications" hx-get="/api/notifications" hx-target="#notification-inbox" hx-trigger="click">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
           <span id="notification-badge-container"></span>
         </button>
         <div class="dropdown" id="notification-inbox" style="width:320px; max-height:400px; overflow-y:auto; padding:0;">
           <div style="padding:16px; color:var(--text-muted); font-size:14px; text-align:center;"><!--extb-ui-->Loading...<!--/extb-ui--></div>
         </div>
       </div>
       <div class="user-menu">
         <button class="avatar" aria-label="Account menu" data-extb-i18n-aria-label="Account menu" style="background:${esc(user.avatar_color || '#6366f1')};padding:0;overflow:hidden;">${user.avatar_url ? `<img src="${esc(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">` : esc(userInitials)}</button>
         <div class="dropdown"><div class="dropdown-inner">
           ${isMod(user) ? '<a href="/admin">cPanel</a>' : ''}
           <a href="/u/${esc(user.display_name || '')}" hx-get="/u/${esc(user.display_name || '')}" hx-target=".main" hx-push-url="true"><!--extb-ui-->Profile<!--/extb-ui--></a>
           <a href="/settings/profile" hx-get="/settings/profile" hx-target=".main" hx-push-url="true"><!--extb-ui-->Settings<!--/extb-ui--></a>
           <a href="/tos" hx-get="/tos" hx-target=".main" hx-push-url="true"><!--extb-ui-->Community Guidelines<!--/extb-ui--></a>
           <form method="post" action="/logout">${csrfField({ csrfToken })}<button type="submit"><!--extb-ui-->Logout<!--/extb-ui--></button></form>
         </div></div>
       </div>`
    : `<a href="/login" hx-get="/login" hx-target=".main" hx-push-url="true"><!--extb-ui-->Login<!--/extb-ui--></a><a href="/register" hx-get="/register" hx-target=".main" hx-push-url="true" class="btn"><!--extb-ui-->Register<!--/extb-ui--></a>`;
}

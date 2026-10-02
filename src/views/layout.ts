import { DEFAULT_BRANDING, type Branding } from '../lib/branding';
import type { User, Room } from '../types';
import { canRead, isMod, isHiddenRoom } from '../access';
import { CURRENT_TOS_VERSION, renderTosBanner } from './tos';
import { renderSaltUpgradeBanner } from './salt-banner';
// Pure presentation utilities now live in ./layout-utils; re-export so existing
// `from './layout'` importers keep working, and import the ones renderLayout uses.
export * from './layout-utils';
import { esc, csrfField, roomIcon, initials, escJsonLd } from './layout-utils';
import {
  renderTopnav,
  renderSidebar,
  renderBottomNav,
  renderFab,
  renderUserMenu,
  renderVerifyBanner,
  renderFlash,
} from './layout-shell';
import { LAYOUT_SCRIPT } from './layout-scripts';
import { chatDockRooms, renderChatDock, renderChatDockTab, renderChatFab, CHAT_DOCK_BOOT, CHAT_DOCK_SCRIPT } from './chat-dock';

export interface LayoutOpts {
  branding?: Branding;
  uploadsEnabled?: boolean;
  origin?: string;
  user: User | null;
  activeRoomSlug?: string;
  title: string;
  body: string;
  rooms: Room[];
  flash?: string;
  canonicalUrl?: string;
  csrfToken?: string;
  showFab?: boolean;
  description?: string;
  jsonLd?: string;
  noindex?: boolean;
  ogType?: 'website' | 'article';
  ogImage?: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleAuthor?: string;
  /** Open the chat dock on load (set by /chat); value = room slug or ''. */
  openChatDock?: string;
}

export function renderLayout(opts: LayoutOpts): string {
  const branding = opts.branding ?? DEFAULT_BRANDING;
  const origin = opts.origin ?? "";
  const { user, activeRoomSlug, title, body, rooms, flash, csrfToken } = opts;
  const memberRooms = rooms.filter((r) => !r.is_page && !r.is_locked && r.kind !== 'chat' && !isHiddenRoom(user, r));
  const lockedRooms = rooms.filter((r) => !r.is_page && r.is_locked && r.kind !== 'chat');
  const userInitials = user?.display_name ? initials(user.display_name) : '';
  const verified = !!user && user.is_approved === 1;
  // Always-open chat dock (views/chat-dock.ts): verified members with at
  // least one readable chat room. Empty = no dock, no dock CSS/JS shipped.
  const dockRooms = chatDockRooms(user, rooms);
  const verifyBanner = renderVerifyBanner({ user, verified, csrfToken });
  const flashBanner = renderFlash({ flash });
  const cPanelLink = user && isMod(user)
    ? '<a href="/admin" hx-get="/admin" hx-target=".main" hx-push-url="true" class="cpanel" style="position:relative;">cPanel <span class="js-mod-badge" style="position:absolute; top:-2px; right:-10px;"></span></a>'
    : '';
  const fabHref = activeRoomSlug ? `/post?room=${esc(activeRoomSlug)}` : '/post';
  const meHref = user ? `/u/${esc(user.display_name || '')}` : '/login';

  const userMenu = renderUserMenu({ user, userInitials, csrfToken });

  const canonicalTag = opts.canonicalUrl
    ? `<link rel="canonical" href="${esc(origin + opts.canonicalUrl)}">`
    : '';

  const SITE_DESC = branding.description;
  const desc = opts.description || SITE_DESC;
  const canonicalHref = `${origin}${opts.canonicalUrl || '/'}`;

  const siteJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: branding.name,
    description: SITE_DESC,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string'
    }
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${esc(branding.name)}">
<meta name="theme-color" content="${esc(branding.accent_color)}">
<meta name="csrf-token" content="${esc(csrfToken || '')}">
${opts.noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<title>${esc(title)} - ${esc(branding.name)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="${esc(opts.ogType ?? 'website')}">
<meta property="og:site_name" content="${esc(branding.name)}">
<meta property="og:title" content="${esc(title)} - ${esc(branding.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonicalHref)}">
<meta property="og:image" content="${esc(opts.ogImage || `${origin}/og-image.svg`)}">
${opts.ogType === 'article' && opts.articlePublishedTime ? `<meta property="article:published_time" content="${esc(opts.articlePublishedTime)}">` : ''}
${opts.ogType === 'article' && opts.articleModifiedTime ? `<meta property="article:modified_time" content="${esc(opts.articleModifiedTime)}">` : ''}
${opts.ogType === 'article' && opts.articleAuthor ? `<meta property="article:author" content="${esc(opts.articleAuthor)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)} - ${esc(branding.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${escJsonLd(siteJsonLd)}</script>
${opts.jsonLd ? `<script type="application/ld+json">${escJsonLd(opts.jsonLd)}</script>` : ''}
${canonicalTag}
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@900&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/css/forum.css">
<script src="https://unpkg.com/htmx.org@2.0.0"></script>
<style>
body[data-uploads-enabled="false"] .md-upload, body[data-uploads-enabled="false"] .md-upload-btn, body[data-uploads-enabled="false"] .chat-upload-btn, body[data-uploads-enabled="false"] .profile-upload { display:none !important; }
  :root {
    --bg-color: #f9fafb;
    --card-bg: #ffffff;
    --text-main: #111827;
    --text-muted: #4b5563;
    --border-color: #d1d5db;
    --primary: ${branding.accent_color};
    --primary-hover: ${branding.accent_color};
    --danger: #dc2626;
    --success: #10b981;
    --warning: #f59e0b;
    --highlight-bg: #dbeafe;
    --warn-bg: #fffbeb;
    --warn-text: #92400e;
    --warn-text-soft: #78350f;
    --flash-warn-bg: #fee2e2;
    --flash-warn-text: #b91c1c;
    --flash-success-bg: #d1fae5;
    --flash-success-text: #065f46;
    --base-font-size: 15px;

    /* Sizing tokens. The mobile switch is 768px sitewide: use
       max-width: 768px for mobile and min-width: 768.02px for desktop -
       never 769px, which leaves a fractional-viewport dead zone.
       .main is intentionally uncapped, so any content column needing a cap
       sets its own from a token here rather than a literal in a view. */
    --measure-chat: 92%;
    --measure-chat-max: 110ch;
    /* Always-open chat dock width. --chat-dock-pct is the viewer's share of the
       viewport (drag divider, chat-dock.ts; default 25vw). --chat-dock-w is the
       docked column: never under 280px, and never so wide that .main drops
       below 480px next to the 240px expanded sidebar. */
    --chat-dock-pct: 25vw;
    --chat-dock-w: clamp(280px, var(--chat-dock-pct), calc(100vw - 720px));
    /* Phone floating chat window, default size (large = up to the topnav). */
    --chat-win-h: 380px;
  }

  body.dark-mode {
    --bg-color: #000000;
    --card-bg: #111111;
    --text-main: #f3f4f6;
    --text-muted: #9ca3af;
    --border-color: #374151;
    --primary: ${branding.accent_color};
    --primary-hover: ${branding.accent_color};
    --success: #059669;
    --warning: #d97706;
    --highlight-bg: #1e3a8a;
    --warn-bg: #2a2107;
    --warn-text: #fbbf24;
    --warn-text-soft: #fcd34d;
    --flash-warn-bg: #3f1d1d;
    --flash-warn-text: #fca5a5;
    --flash-success-bg: #063325;
    --flash-success-text: #6ee7b7;
  }
  body.font-s { --base-font-size: 13.5px; }
  body.font-l { --base-font-size: 17px; }
  body.dark-mode .post-body code { background: #1e293b; color: #e2e8f0; }
  body.dark-mode .post-sidebar { background: var(--bg-color); }
  body.dark-mode .btn-secondary { background: #1f2937; color: #f3f4f6; border-color: #374151; }
  body.dark-mode .btn-secondary:hover { background: #374151; border-color: #4b5563; color: #f3f4f6; text-decoration: none; }
  body.dark-mode .action-btn { background: #1f2937; color: #d1d5db; border-color: #374151; }
  body.dark-mode .action-btn:hover { background: #374151; color: #f3f4f6; border-color: #4b5563; }

  * { box-sizing: border-box; }
  body { 
    margin: 0; 
    font: var(--base-font-size)/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-main); 
    background: var(--bg-color); 
    -webkit-font-smoothing: antialiased;
    transition: background-color 0.3s, color 0.3s;
  }
  
  /* Smooth Scroll & Highlight */
  :target {
    animation: target-fade 3s ease-in-out;
  }
  @keyframes target-fade {
    0% { background-color: var(--highlight-bg); }
    100% { background-color: transparent; }
  }
  .highlight-pulse {
    animation: target-fade 3s ease-in-out;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    html { scroll-behavior: auto !important; }
  }

  .skip-link { position: absolute; left: -9999px; top: 0; z-index: 1000; padding: 10px 16px; background: var(--primary); color: #ffffff; font-weight: 700; border-radius: 0 0 8px 0; }
  .skip-link:focus { left: 0; }

  a { color: var(--primary); text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: none; }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }
  .btn:focus-visible, .btn-secondary:focus-visible, .btn-danger:focus-visible, .btn-outline-danger:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.35); }
  
  /* Top Nav */
  .topnav { display: flex; align-items: center; gap: 20px; padding: 0 20px 0 8px; height: 64px; background: var(--card-bg); border-bottom: 2px solid var(--border-color); position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08); }
  .hamburger { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; background: none; border: none; cursor: pointer; color: var(--text-main); padding: 0; margin-right: 4px; transition: opacity 0.2s; }
  .hamburger:active { opacity: 0.6; }
  .hamburger svg { width: 24px; height: 24px; }
  .brand { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 24px; letter-spacing: -0.75px; line-height: 1; align-self: center; background: linear-gradient(to right, #e40303, #ff8c00, #ffed00, #008026, #004dff, #732982); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1)); }
  .topnav nav { display: flex; align-items: center; gap: 20px; margin-right: auto; }
  .topnav nav a { display: flex; align-items: center; height: 64px; color: var(--text-main); font-weight: 600; font-size: 14px; transition: color 0.2s; }
  .topnav nav a:hover { color: var(--primary); text-decoration: none; }
  .topnav nav a.active { color: var(--primary); box-shadow: inset 0 -2px 0 var(--primary); }
  .dm-nav-btn { position: relative; display: inline-flex !important; align-items: center; justify-content: center; width: 36px; height: 36px !important; border-radius: 8px; color: var(--text-muted); transition: color 0.2s, background 0.2s; flex-shrink: 0; border-bottom: none !important; box-shadow: none !important; }
  .dm-nav-btn:hover { color: var(--text-main); background: var(--bg-color); text-decoration: none; }
  .dm-nav-btn.has-unread { color: var(--primary); }
  .dm-nav-btn.active { background: var(--bg-color); color: var(--primary); }
  #dm-nav-badge-container { position: absolute; top: 0; right: 0; width: 0; height: 0; overflow: visible; pointer-events: none; }
  .dm-nav-badge { position: absolute; top: 0; right: 0; background: var(--primary); color: #fff; font-size: 10px; font-weight: 800; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 2px solid var(--card-bg); transform: translate(25%, -25%); }
  
  .topnav form { margin: 0; position: relative; }
  .topnav input { padding: 8px 16px; border: 2px solid var(--border-color); border-radius: 9999px; background: var(--bg-color); font-size: 14px; width: 240px; transition: all 0.2s; color: var(--text-main); font-weight: 500; }
  .topnav input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.15); background: var(--card-bg); width: 280px; }
  
  .topnav .right { display: flex; align-items: center; gap: 12px; }
  .staff-nav { display: flex; align-items: center; gap: 8px; }
  .staff-nav a {
    display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
    border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-bg);
    color: var(--text-main); font-size: 13px; font-weight: 700; text-decoration: none;
    transition: background 0.2s, border-color 0.2s, color 0.2s; white-space: nowrap;
  }
  .staff-nav a:hover { background: var(--bg-color); border-color: var(--primary); color: var(--primary); text-decoration: none; }
  .staff-nav a.cpanel { color: var(--primary); }
  .staff-nav a.cpanel:hover { border-color: var(--primary); color: var(--primary); }
  
  /* Icon Buttons */
  .icon-btn { 
    background: none; border: none; padding: 8px; border-radius: 8px; cursor: pointer; color: var(--text-muted); transition: all 0.2s; display: flex; align-items: center; justify-content: center; position: relative;
  }
  .icon-btn:hover { background: var(--bg-color); color: var(--text-main); }
  
  /* Toast */
  #toast-container { position: fixed; top: 80px; right: 24px; z-index: 2000; display: flex; flex-direction: column; gap: 12px; }
  .toast { 
    background: var(--card-bg); color: var(--text-main); padding: 12px 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; animation: slideIn 0.3s ease-out; min-width: 280px;
  }
  .toast-success { border-left: 4px solid #10b981; }
  .toast-error { border-left: 4px solid var(--danger); }
  .toast-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-muted); margin-left: auto; }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  .btn { background: var(--primary); color: #fff; padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; transition: all 0.2s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .btn:hover { background: var(--primary-hover); color: #fff; text-decoration: none; box-shadow: 0 4px 6px -1px rgba(29, 78, 216, 0.2); }
  .btn:active { background: #1e3a8a; transform: scale(0.98); }
  .btn-sm { padding: 6px 12px; font-size: 13px; border-radius: 8px; }
  .btn-secondary { background: #f3f4f6; color: #111827; padding: 10px 18px; border-radius: 12px; border: 1px solid var(--border-color); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .btn-secondary:hover { background: #e5e7eb; border-color: #9ca3af; text-decoration: none; color: #111827; }
  .btn-secondary:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
  .btn-danger { background: var(--danger); color: #fff; padding: 10px 18px; border-radius: 12px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .btn-danger:hover { background: #b91c1c; color: #fff; text-decoration: none; }
  .btn-outline-danger { background: none; color: var(--danger); border: 2px solid var(--danger); padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .btn-outline-danger:hover { background: var(--danger); color: #fff; text-decoration: none; }

  .user-menu { position: relative; }
  .user-menu .avatar { width: 36px; height: 36px; border-radius: 50%; border: none; color: #fff; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .user-menu .dropdown { display: none; position: absolute; right: 0; top: 36px; padding-top: 8px; background: transparent; z-index: 1000; }
  .user-menu .dropdown-inner { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; min-width: 200px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); padding: 8px 0; }
  .user-menu:hover .dropdown, .user-menu:focus-within .dropdown { display: block; }
  .user-menu .dropdown a, .user-menu .dropdown button { display: block; width: 100%; text-align: left; padding: 10px 16px; background: none; border: 0; color: var(--text-main); font-size: 14px; cursor: pointer; font-weight: 600; }
  .user-menu .dropdown a:hover, .user-menu .dropdown button:hover { background: var(--bg-color); text-decoration: none; }
  
  /* Notifications */
  .notification-menu .dropdown { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); padding-top: 0; }
  .unread-dot { width: 8px; height: 8px; background: var(--danger); border-radius: 50%; display: inline-block; }
  .unread-badge { position: absolute; top: 0; right: 0; background: var(--danger); color: #fff; font-size: 10px; font-weight: 800; min-width: 18px; height: 18px; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0 4px; border: 2px solid var(--card-bg); transform: translate(25%, -25%); }
  .notification-item { padding: 12px 16px; border-bottom: 1px solid var(--border-color); transition: background 0.2s; background: var(--card-bg); }
  .notification-item:hover { background: var(--bg-color); }
  .notification-item.unread { border-left: 3px solid var(--primary); background: var(--highlight-bg); }

  /* Layout */
  .layout {
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 0; max-width: 100%; margin: 0; padding: 0;
  }
  /* Only animate the grid/sidebar during a deliberate hamburger toggle, not on
     incidental reflows (entering chat/dm changes scrollbar width -> grid reflow). */
  body.sidebar-animating .layout { transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  body.sidebar-animating .sidebar { transition: width 0.3s ease; }
  .main { min-width: 0; padding: 24px 28px; }
  @media (max-width: 1024px) { .main { padding: 20px 16px; } }
  @media (max-width: 768px) { .main { padding: 0; } }
  
  /* Sidebar */
  .sidebar { 
    position: sticky; top: 64px; height: calc(100vh - 64px);
    background: var(--bg-color);
    padding: 12px 0;
    display: flex; flex-direction: column; align-items: center;
    border-right: 1px solid var(--border-color);
    overflow-y: auto; overflow-x: hidden;
    scrollbar-width: none; -ms-overflow-style: none;
  }
  .sidebar::-webkit-scrollbar { display: none; }
  .sidebar h3 { display: none; }
  .sidebar ul { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .sidebar li { width: 100%; display: flex; justify-content: center; }
  .sidebar li a {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 9px;
    color: var(--text-main); transition: all 0.2s;
    position: relative;
    border: none; padding: 0; margin: 0;
    text-decoration: none;
  }
  .sidebar li a:hover { background: var(--hover-bg); }
  .sidebar li a.htmx-request { background: var(--hover-bg); opacity: 0.6; }
  .sidebar li a.active { background: var(--primary); color: #fff !important; }
  .sidebar li a.active .room-icon { color: #fff !important; }
  .sidebar li a .room-label { display: none; }
  .sidebar li a .room-icon { font-size: 20px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
  .sidebar-read-all-form { width: 100%; display: flex; justify-content: center; margin: 0; }
  .sidebar-read-all-btn {
    display: flex; align-items: center; min-width: 44px; width: 44px; height: 44px; justify-content: center;
    background: transparent; color: var(--text-muted); border: none; border-radius: 10px; padding: 0;
    font: inherit; font-weight: 500; cursor: pointer; transition: background 0.2s, color 0.2s;
  }
  .sidebar-read-all-btn:hover { background: var(--border-color); color: var(--text-main); }
  .sidebar-read-all-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .sidebar-read-all-btn .room-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .sidebar-read-all-btn .room-label { display: none; }
  .sidebar .sep { width: 32px; height: 1.5px; background: var(--border-color); margin: 4px 0; opacity: 1; flex-shrink: 0; }

  /* Desktop Expanded Override */
  body:not(.sidebar-collapsed) .layout { grid-template-columns: 240px 1fr; }
  body:not(.sidebar-collapsed) .sidebar { align-items: flex-start; padding: 16px; overflow-y: auto; }
  body:not(.sidebar-collapsed) .sidebar h3 { display: block; margin: 0 0 10px 12px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.1em; font-weight: 800; }
  body:not(.sidebar-collapsed) .sidebar ul { align-items: stretch; gap: 2px; }
  body:not(.sidebar-collapsed) .sidebar li a { width: 100%; height: auto; padding: 8px 12px; border-radius: 8px; justify-content: flex-start; gap: 12px; }
  body:not(.sidebar-collapsed) .sidebar li a .room-label { display: block; }
  body:not(.sidebar-collapsed) .sidebar li a .room-icon { width: 22px; height: 22px; font-size: 16px; }
  body:not(.sidebar-collapsed) .sidebar .sidebar-read-all-btn { width: 100%; justify-content: flex-start; gap: 12px; padding: 8px 12px; border-radius: 8px; }
  body:not(.sidebar-collapsed) .sidebar .sidebar-read-all-btn .room-label { display: block; }
  body:not(.sidebar-collapsed) .sidebar .sep { width: calc(100% - 24px); margin: 10px 12px; }

  /* Collapsible sidebar helper */
  body.sidebar-collapsed .layout { grid-template-columns: 60px 1fr; }

  /* Flash messages */
  .flash { padding: 12px 16px; background: var(--highlight-bg); border-left: 4px solid var(--warning); color: var(--text-main); margin-bottom: 24px; border-radius: 4px; font-size: 14px; }
  .flash-warn { background: var(--flash-warn-bg); border-left-color: var(--danger); color: var(--flash-warn-text); }
  .flash-success { background: var(--flash-success-bg); border-left-color: var(--success); color: var(--flash-success-text); }
  .card { background: var(--card-bg); border: 1.5px solid var(--border-color); border-radius: 20px; padding: 24px; transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover { border-color: var(--primary); }
  @media (max-width: 768px) { .card { border-radius: 0; border-left: none; border-right: none; padding: 20px 16px; } }
  .card { background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 16px; padding: 24px; transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover { border-color: var(--primary); box-shadow: 0 4px 6px -1px rgba(29, 78, 216, 0.08); }
  .card-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0 0 4px; }
  .card-meta { font-size: 13px; color: var(--text-muted); }

  /* Badge */
  .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
  .badge-primary { background: #dbeafe; color: var(--primary-hover); }
  .badge-success { background: #d1fae5; color: var(--success); }
  .badge-warn { background: #fef3c7; color: var(--warning); }
  .badge-danger { background: #fee2e2; color: var(--danger); }
  .badge-neutral { background: #f3f4f6; color: #374151; }
  .badge-op { background: var(--primary); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; vertical-align: middle; margin-left: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

  /* Breadcrumb */
  .breadcrumb { display: flex; align-items: center; gap: 10px; font-size: 16px; color: var(--text-muted); margin-bottom: 24px; flex-wrap: wrap; }
  .breadcrumb a { color: var(--text-muted); font-weight: 700; }
  .breadcrumb a:hover { color: var(--primary); text-decoration: none; }
  .breadcrumb-sep { color: var(--border-color); font-weight: 700; }
  .breadcrumb span:last-child { color: var(--text-main); font-weight: 800; }

  /* Pagination */
  .pagination { display: flex; align-items: center; gap: 4px; margin-top: 32px; }
  .pagination a, .pagination button { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 8px; font-size: 14px; font-weight: 600; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-main); transition: all 0.2s; cursor: pointer; font-family: inherit; }
  .pagination a:hover, .pagination button:hover { background: #f3f4f6; border-color: #9ca3af; text-decoration: none; }
  .pagination .active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .pagination .disabled { opacity: 0.4; cursor: not-allowed; }

  /* Admin-only affordance inside a mod-visible cPanel section/action.
     Cosmetic only - the server must never send the underlying data/markup
     for what this wraps to a non-admin viewer in the first place. */
  .admin-locked { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

  /* Author links */
  .author-link { color: var(--text-main); font-weight: 700; }
  .author-link:hover { color: var(--primary); text-decoration: none; }
  .author-anon { color: var(--text-muted); font-weight: 600; }

  /* Forum Thread View */
  .topic-head { margin-bottom: 32px; }
  .topic-head h1 { margin: 0 0 8px; font-size: 30px; font-weight: 800; letter-spacing: -0.025em; color: var(--text-main); }

  /* Post Card - replies stack close together (they're all part of one
     conversation); the OP card (.op-card) gets real separation + a tinted
     sidebar so it reads as "the topic" at a glance, not just another reply. */
  .post-card { display: flex; background: var(--card-bg); border: 1.5px solid var(--border-color); border-radius: 20px; margin-bottom: 4px; overflow: hidden; transition: border-color 0.2s; }
  .post-card:hover { border-color: var(--primary); }
  .post-card.op-card { margin-bottom: 20px; }
  .post-card.op-card .post-sidebar { background: var(--highlight-bg); }
  .post-sidebar { width: 68px; padding: 20px 0 0; flex-shrink: 0; background: var(--bg-color); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; }
  .post-avatar { width: 44px; height: 44px; background: var(--primary); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; }
  .post-main { flex: 1; padding: 20px; min-width: 0; }
  .post-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .post-author { font-weight: 700; font-size: 14px; color: var(--text-main); }
  .post-author:hover { color: var(--primary); text-decoration: none; }
  .post-time { font-size: 12px; color: var(--text-muted); }
  .post-uid { margin-left: auto; background: var(--bg-color); color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; line-height: 1.4; }
  .post-uid:hover { background: var(--card-bg); color: var(--primary); border-color: var(--primary); }
  .post-uid.copied { background: var(--primary); color: #fff; border-color: var(--primary); }
  .report-icon-btn { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; padding: 2px 5px; border-radius: 6px; line-height: 1.4; transition: background 0.15s, color 0.15s; }
  .report-icon-btn:hover { background: var(--hover-bg); color: var(--danger); }
  .post-body { font-size: 15px; line-height: 1.7; color: var(--text-main); overflow-wrap: anywhere; word-break: break-word; }
  .post-body p { margin: 0 0 1em; }
  .post-body p:last-child { margin-bottom: 0; }
  .post-body pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .post-body code { background: #f1f5f9; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 13px; overflow-wrap: anywhere; word-break: break-word; }
  .post-body pre code { background: none; color: inherit; padding: 0; }
  .post-body blockquote { border: 1px solid var(--border-color); border-left: 4px solid var(--primary); border-radius: 6px; margin: 0 0 1em 0; padding: 0; overflow: hidden; background: var(--card-bg); color: var(--text-main); font-style: normal; }
  .post-body blockquote > p { margin: 0; padding: 10px 14px; }
  .post-body blockquote > p:first-child { background: var(--bg-color); border-bottom: 1px solid var(--border-color); font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .post-body blockquote > p:not(:first-child) { font-size: 14px; line-height: 1.55; }
  .post-body blockquote a { color: inherit; font-weight: 700; text-decoration: none; }
  .post-body blockquote a:hover { color: var(--primary); text-decoration: underline; }
  .post-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; border: 1px solid var(--border-color); }
  .post-actions { display: flex; gap: 8px; margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 16px; flex-wrap: wrap; }
  /* Reply sits on the reactions row (far right, via margin-left:auto on the
     button) instead of its own .post-actions row below. .post-reactions
     carries its own inline margin-top (renderReactions() in post.ts and its
     deliberate API-fragment twin in api/posts.ts) - zero it here so the row
     doesn't get a doubled gap now that a wrapper also has margin-top. */
  .post-reactions-row .post-reactions { margin-top: 0 !important; }
  .action-btn { display: flex; align-items: center; gap: 6px; background: #e5e7eb; border: 1px solid var(--border-color); color: #1f2937; font-size: 13px; font-weight: 700; cursor: pointer; padding: 8px 16px; border-radius: 8px; transition: all 0.2s; font-family: inherit; }
  .action-btn:hover { background: #d1d5db; color: #111827; border-color: #9ca3af; }
  /* Uniformize all buttons inside .post-actions regardless of original class */
  .post-actions > button, .post-actions > .action-btn { height: 34px; min-height: 34px; padding: 0 14px; font-size: 13px; font-weight: 700; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-family: inherit; line-height: 1; transition: background 0.15s, border-color 0.15s, color 0.15s; box-shadow: none; }
  .post-actions > button:hover { background: var(--card-bg); border-color: var(--text-muted); color: var(--text-main); text-decoration: none; }
  .post-actions > .btn-danger, .post-actions > .btn-sm.btn-danger { background: transparent; color: var(--danger); border-color: var(--danger); }
  .post-actions > .btn-danger:hover, .post-actions > .btn-sm.btn-danger:hover { background: var(--danger); color: #fff; border-color: var(--danger); }
  body.dark-mode .post-actions > button { background: #1f2937; color: #f3f4f6; border-color: #374151; }
  body.dark-mode .post-actions > button:hover { background: #374151; border-color: #4b5563; }

  /* === Threaded replies === */
  .thread-wrap { /* wraps every post-card so subtree can be hidden in one go */
    position: relative;
  }
  .post-card.depth-1 { margin-left: 24px; }
  .post-card.depth-2 { margin-left: 48px; }
  .post-card.depth-3 { margin-left: 72px; }

  @media (max-width: 640px) {
    .post-card.depth-1 { margin-left: 12px; }
    .post-card.depth-2 { margin-left: 24px; }
    .post-card.depth-3 { margin-left: 36px; }
  }

  .post-card.depth-1::before,
  .post-card.depth-2::before,
  .post-card.depth-3::before {
    content: "";
    position: absolute;
    left: -12px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border-color);
    border-radius: 1px;
  }

  .thread-collapse-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    margin-right: 8px;
    flex-shrink: 0;
    transition: transform 0.18s ease, background 0.15s, color 0.15s, border-color 0.15s;
    line-height: 1;
  }
  .thread-collapse-btn:hover {
    background: var(--card-bg);
    color: var(--primary);
    border-color: var(--primary);
  }
  .thread-collapse-btn svg { display: block; }

  .thread-wrap.thread-collapsed > .post-card .thread-collapse-btn { transform: rotate(-90deg); }
  .thread-wrap.thread-collapsed > .post-card .thread-collapse-btn::after {
    content: attr(data-hidden-count);
    margin-left: 6px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
  }

  .thread-wrap.thread-hidden { display: none; }

  body.dark-mode .thread-collapse-btn { background: transparent; color: #9ca3af; border-color: #374151; }
  body.dark-mode .thread-collapse-btn:hover { background: #374151; color: #f3f4f6; border-color: #4b5563; }
  body.dark-mode .post-card.depth-1::before,
  body.dark-mode .post-card.depth-2::before,
  body.dark-mode .post-card.depth-3::before { background: #374151; }

  /* Markdown Toolbar */
  .md-toolbar { display: flex; align-items: center; gap: 2px; padding: 6px 0 8px; }
  .md-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: none; border: none; border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all 0.15s; font-family: inherit; }
  .md-btn:hover { background: var(--border-color); color: var(--text-main); }
  .md-btn:active { transform: scale(0.92); }
  .md-btn svg { width: 17px; height: 17px; }
  .md-btn span { font-size: 15px; }

  /* Topic card (feed) */
  .topic-card { position: relative; cursor: pointer; display: flex; flex-direction: column; background: var(--card-bg); border: 1.5px solid var(--border-color); border-radius: 12px; padding: 10px 14px; margin-bottom: 6px; transition: border-color 0.2s, box-shadow 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
  .topic-card:hover { border-color: var(--primary); box-shadow: 0 8px 16px -4px rgba(29,78,216,0.1); }
  .topic-card .tc-main, .topic-card .tc-title, .topic-card .topic-title-link { border-radius: inherit; }
  .topic-title-link { color: var(--text-main); font-weight: 700; }
  .topic-title-link::after { content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: 1; }
  .topic-card .topic-title-link:focus-visible::after { outline: 2px solid var(--primary); outline-offset: 3px; }
  .topic-card .author-link, .topic-card .badge, .topic-card .tag-chip { position: relative; z-index: 2; }
  .topic-title-link:hover { color: var(--primary); text-decoration: none; }
  .tag-chip { display: inline-block; background: var(--bg-color); color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 8px; font-size: 12px; margin-right: 6px; text-decoration: none; }
  .tag-chip:hover { border-color: var(--primary); color: var(--primary); text-decoration: none; }

  /* Classic feed view */
  #topic-list.classic .topic-card { flex-direction: row; align-items: center; gap: 20px; padding: 10px 16px; margin-bottom: 0; border-radius: 0; border: none; border-bottom: 1px solid var(--border-color); box-shadow: none; }
  #topic-list.classic .topic-card:first-child { border-top: 1px solid var(--border-color); border-radius: 8px 8px 0 0; }
  #topic-list.classic .topic-card:last-child { border-radius: 0 0 8px 8px; }
  #topic-list.classic .topic-card:hover { background: rgba(0,0,0,0.02); border-color: transparent; box-shadow: none; }
  #topic-list.classic .tc-title { font-size: 15px; margin-bottom: 2px; }
  #topic-list.classic .tc-meta { font-size: 12px; }
  #topic-list.classic .tc-tags { margin-top: 3px; }
  #topic-list.classic .tc-aside { flex-direction: row; align-items: center; gap: 6px; flex-shrink: 0; min-width: auto; margin-top: 0; }
  #topic-list.classic .tc-count { font-size: 16px; font-weight: 800; line-height: 1; color: var(--primary); }
  #topic-list.classic .tc-label { font-size: 11px; }
  .tc-title { font-weight: 600; }
  .topic-card--unread .tc-title { font-weight: 800; }
  .tc-unread-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin-right: 6px; vertical-align: middle; flex-shrink: 0; }

  /* Forum Index (classic view) - desktop grid + mobile card stack */
  .fi-layout { display:flex; gap:24px; align-items:flex-start; }
  .fi-main { flex:1; min-width:0; }
  .fi-hdr { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
  .fi-rl { background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; overflow:hidden; margin-bottom:20px; }
  .fi-rr { display:grid; grid-template-columns:2.8fr 1.4fr 80px 80px; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border-color); }
  .fi-rr:last-child { border-bottom:none; }
  .fi-rr:hover { background:var(--hover-bg); }
  .fi-rc { display:flex; align-items:center; gap:10px; }
  .fi-rr-info { display:flex; flex-direction:column; gap:2px; }
  .fi-ri { width:36px; height:36px; border-radius:8px; flex-shrink:0; background:var(--hover-bg); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; font-size:17px; }
  .fi-rn { font-size:14px; font-weight:700; color:var(--text-main); text-decoration:none; }
  .fi-rn:hover { color:var(--primary); }
  .fi-rd { font-size:12px; color:var(--text-muted); line-height:1.4; }
  .fi-lp-lnk { font-size:12px; font-weight:600; color:var(--text-main); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-decoration:none; max-width:148px; }
  .fi-lp-lnk:hover { color:var(--primary); }
  .fi-lp-meta { font-size:11px; color:var(--text-muted); margin-top:2px; white-space:nowrap; }
  .fi-rs-w { display:contents; }
  .fi-rs { text-align:center; }
  .fi-rs strong { display:block; font-size:15px; font-weight:700; color:var(--text-main); }
  .fi-rs small { display:block; font-size:10px; text-transform:uppercase; font-weight:700; letter-spacing:0.05em; color:var(--text-muted); margin-top:1px; }
  .fi-aside { width:260px; flex-shrink:0; }
  .fi-sc { background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; overflow:hidden; margin-bottom:14px; }
  .fi-sc-hd { padding:10px 14px; background:var(--hover-bg); border-bottom:1px solid var(--border-color); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); }
  .fi-sc-new { background:var(--success); color:var(--card-bg); font-size:9px; padding:1px 5px; border-radius:4px; vertical-align:middle; }

  /* Needs You - unanswered thread queue (/needs-you) */
  .ny-list { display:flex; flex-direction:column; gap:7px; }
  .ny-item { display:block; background:var(--card-bg); border:1.5px solid var(--border-color); border-radius:12px; padding:11px 14px; text-decoration:none; color:var(--text-main); transition:border-color 0.2s; }
  .ny-item:hover { border-color:var(--primary); }
  .ny-title { font-size:15px; font-weight:700; line-height:1.3; margin-bottom:4px; color:var(--text-main); }
  .ny-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12px; color:var(--text-muted); }
  .ny-age { margin-left:auto; font-weight:600; }
  .ny-age--urgent { color:var(--warning); }
  .ny-foot { margin-top:14px; font-size:12px; color:var(--text-muted); }
  .ny-empty { text-align:center; padding:44px 16px; background:var(--card-bg); border:1.5px solid var(--border-color); border-radius:12px; }
  .ny-empty-title { font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:4px; }
  .ny-empty-sub { font-size:13.5px; color:var(--text-muted); margin:0 0 16px; }
  @media (max-width: 640px) {
    .fi-layout { flex-direction:column; }
    .fi-aside { display:none; }
    .fi-rth { display:none; }
    .fi-rl { border-radius:10px; }
    .fi-rr { display:grid; grid-template-columns:1fr auto; align-items:center; padding:12px 14px; column-gap:12px; }
    .fi-rr-top { display:flex; align-items:center; gap:10px; padding:0; }
    .fi-rr-lp { display:none; }
    .fi-rr-stats { display:flex !important; flex-direction:row; gap:10px; }
    .fi-rs { display:flex; flex-direction:column; align-items:center; text-align:center; }
    .fi-rs strong { display:block; font-size:14px; font-weight:800; line-height:1; color:var(--text-main); }
    .fi-rs small { display:block; font-size:9px; text-transform:uppercase; font-weight:700; letter-spacing:0.04em; color:var(--text-muted); margin-top:2px; }
    .fi-ri { width:38px; height:38px; font-size:18px; }
  }

  /* Chat cleanup mode */
  body.cleanup-mode .chat-del-btn { display: inline-block !important; }
  body.cleanup-mode .chat-message { border-color: #fca5a5; }
  body.cleanup-mode #chat-cleanup-btn { background: var(--danger); color: #fff; border-color: var(--danger); }
  #chat-cleanup-btn .cleanup-on { display: none; }
  body.cleanup-mode #chat-cleanup-btn .cleanup-on { display: inline; }
  body.cleanup-mode #chat-cleanup-btn .cleanup-off { display: none; }

  /* Form inputs */
  input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="number"], input[type="url"], input[type="tel"], textarea, select { width: 100%; padding: 10px 14px; border: 2px solid var(--border-color); border-radius: 12px; font-family: inherit; font-size: 15px; color: var(--text-main); background: var(--card-bg); transition: border-color 0.2s, box-shadow 0.2s; }
  input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus, input[type="search"]:focus, input[type="number"]:focus, input[type="url"]:focus, input[type="tel"]:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.1); }
  input[type="text"]:disabled, input[type="email"]:disabled, input[type="password"]:disabled, textarea:disabled, select:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
  input.error, textarea.error, select.error { border-color: var(--danger); }
  textarea.image-transfer-drag { border-color: var(--primary); box-shadow: 0 0 0 3px var(--highlight-bg); }
  textarea.image-transfer-busy { background: var(--bg-color); cursor: progress; }
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: var(--text-main); }
  .form-hint { margin-top: 6px; font-size: 13px; color: var(--text-muted); }
  .form-error { margin-top: 6px; font-size: 13px; color: var(--danger); }

  /* Mobile-only elements hidden on desktop */
  /* Drawer - right-side slide-in panel (desktop), full-screen sheet (mobile) */
  .drawer-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); z-index: 998; opacity: 0; pointer-events: none; transition: opacity 0.24s ease; display: block; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
  .drawer-overlay.open { opacity: 1; pointer-events: auto; }
  .drawer-content { position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100vw; background: var(--card-bg); box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18); display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1); overflow: hidden; z-index: 999; }
  .drawer-overlay.open .drawer-content { transform: translateX(0); }
  .drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border-color); background: var(--card-bg); position: sticky; top: 0; z-index: 2; flex-shrink: 0; }
  .drawer-header h2 { margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  .drawer-close { display: none; }
  .drawer-header .drawer-close { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border-radius: 8px; background: transparent; border: 1px solid transparent; color: var(--text-muted); font-size: 22px; line-height: 1; cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .drawer-header .drawer-close:hover { background: var(--bg-color); color: var(--text-main); border-color: var(--border-color); }
  .drawer-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
  .drawer-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 24px; }
  .drawer-section { display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px; border-bottom: 1px solid var(--border-color); }
  .drawer-section:last-child { border-bottom: none; padding-bottom: 0; }
  .drawer-section-title { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 0; }
  .drawer-field { display: flex; flex-direction: column; gap: 6px; }
  .drawer-field label, .drawer-field .drawer-field-label { font-size: 13px; font-weight: 600; color: var(--text-main); }
  .drawer-field .drawer-field-hint { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
  .drawer-field input[type="color"] { width: 100%; height: 40px; padding: 4px; border: 2px solid var(--border-color); border-radius: 12px; background: var(--card-bg); cursor: pointer; }
  .drawer-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .drawer-checkbox-group { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; }
  .drawer-checkbox-group label { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--text-main); cursor: pointer; }
  .drawer-checkbox-group input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); flex-shrink: 0; cursor: pointer; }
  .drawer-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--card-bg); flex-shrink: 0; }
  .drawer-footer .btn-ghost { background: transparent; color: var(--text-main); border: 1.5px solid var(--border-color); padding: 9px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
  .drawer-footer .btn-ghost:hover { background: var(--bg-color); border-color: var(--text-muted); }
  .drawer-footer .btn-primary { background: var(--primary); color: #fff; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; transition: background 0.15s; }
  .drawer-footer .btn-primary:hover { background: var(--primary-hover); }
  .bottom-nav { display: none; }
  .fab { display: flex; align-items: center; justify-content: center; position: fixed; bottom: 32px; right: 32px; width: 56px; height: 56px; border-radius: 50%; background: #1d4ed8; color: #fff; font-size: 28px; line-height: 56px; text-align: center; box-shadow: 0 4px 16px rgba(29,78,216,0.4); -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform 0.15s, box-shadow 0.15s; z-index: 1001; text-decoration: none; border: none; cursor: pointer; padding: 0; }
  body.fab-hidden .fab { display: none; }

  /* Compose: a normal page card, not a fullscreen takeover - topnav/sidebar
     stay visible and clickable the whole time (see AGENTS.md task-A note). */
  .post-wrap { display: block; max-width: 720px; margin: 0 auto; background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 16px; padding: 12px; }
  .post-hd { margin-bottom: 6px; }
  .post-hd h1 { margin: 0; font-size: 17px; font-weight: 800; color: var(--text-main); }
  .post-room-label { font-size: 13px; color: var(--text-muted); margin-bottom: 0; }
  .post-body-wrap { display: flex; flex-direction: column; gap: 4px; }
  .post-body-wrap .form-label { margin-bottom: 1px; }
  /* .cw-picker ships its own margin/padding (tags.ts) for its usual standalone
     context (edit/reply forms) - collapse both here so room/CW/title sit as
     close together as the rest of the compose form. */
  .post-body-wrap .cw-picker { margin: 0; padding: 6px 10px; }
  .post-body-wrap select { padding: 6px 10px; }
  .post-title-in { font-size: 17px; font-weight: 700; padding: 6px 10px; }
  .post-text-in { min-height: 100px; resize: vertical; padding: 6px 10px; }
  .post-ft { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; }
  .post-ft-actions { display: flex; justify-content: flex-end; }

  @media (max-width: 768px) {
    .hamburger { display: flex; }
    .page-head { padding: 20px 16px; margin-bottom: 0 !important; }
    body { padding-bottom: calc(62px + env(safe-area-inset-bottom)); }
    body .layout, body:not(.sidebar-collapsed) .layout, body.sidebar-collapsed .layout { grid-template-columns: 1fr !important; padding: 0 16px; margin: 16px auto 0; }
    .main { padding: 0; min-width: 0; }
    .feed-head { margin-bottom: 12px !important; }
    .feed-title { font-size: 17px !important; }
    .topic-card { padding: 10px 14px; }
    .fi-hdr { margin-bottom: 10px; }
    .sidebar { transform: translateX(-100%); position: fixed !important; top: 0; left: 0; bottom: 0; width: 82%; background: var(--card-bg); z-index: 999; padding: 56px 16px 32px; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); overflow-y: auto; }
    .sidebar.open { transform: translateX(0); }
    .sidebar .sidebar-read-all-form { width: 100%; }
    .sidebar .sidebar-read-all-btn { width: 100%; justify-content: flex-start; gap: 12px; padding: 8px 12px; border-radius: 8px; }
    .sidebar .sidebar-read-all-btn .room-label { display: block; }
    /* Mobile drawer = full-screen sheet sliding up from bottom */
    .drawer-content { top: auto; right: 0; left: 0; bottom: 0; width: 100%; max-width: 100%; height: 92vh; height: 92dvh; border-top-left-radius: 16px; border-top-right-radius: 16px; transform: translateY(100%); box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.22); }
    .drawer-overlay.open .drawer-content { transform: translateY(0); }
    .sidebar > .drawer-close { display: flex; position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; align-items: center; justify-content: center; font-size: 24px; border-radius: 8px; background: none; border: none; cursor: pointer; color: var(--text-muted); }
    .drawer-header { padding: 14px 18px 12px; position: relative; }
    .drawer-header::before { content: ""; position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 40px; height: 4px; border-radius: 2px; background: var(--border-color); }
    .drawer-body { padding: 16px 18px; gap: 20px; }
    .drawer-row { grid-template-columns: 1fr; }
    .drawer-footer { padding: 12px 18px calc(14px + env(safe-area-inset-bottom)); }
    .topnav nav { display: none; }
    .topnav form { display: none; }
    .topnav input { width: 140px; }
    .bottom-nav {
      display: flex;
      position: fixed; bottom: 0; left: 0; right: 0;
      height: 62px;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--card-bg);
      border-top: 1px solid var(--border-color);
      z-index: 100;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
    }
    .bottom-nav a, .bottom-nav button {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px; font-size: 10px; font-weight: 600;
      color: var(--text-muted); background: none; border: none;
      cursor: pointer; font-family: inherit;
      text-decoration: none; -webkit-tap-highlight-color: transparent;
      touch-action: manipulation; padding: 8px 0;
      transition: color 0.15s;
      position: relative;
    }
    .bn-badge { 
      position: absolute; top: 6px; right: 20%; 
      background: var(--danger); color: #fff; 
      font-size: 9px; font-weight: 800; 
      min-width: 14px; height: 14px; border-radius: 7px; 
      display: flex; align-items: center; justify-content: center; 
      padding: 0 3px; border: 2px solid var(--card-bg); line-height: 1; 
    }
    .bn-badge:empty { display: none; }
    .chat-nav-badge { display: inline-block; width: 8px; height: 8px; background: var(--primary); border-radius: 50%; border: 2px solid var(--card-bg); }
    
    /* Input Styling Refined */
    .chat-input-row, .dm-compose { background: var(--card-bg); padding: 12px; border-top: 1px solid var(--border-color); border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
    .dm-input-row, .chat-input-inner { display: flex; gap: 10px; align-items: center; }
    .dm-compose textarea, .chat-input-row input { 
      flex: 1; border: 1.5px solid var(--border-color); border-radius: 20px; padding: 8px 16px; 
      font-size: 14px; background: var(--bg-color); color: var(--text-main); resize: none;
      transition: border-color 0.2s;
    }
    .dm-compose textarea:focus, .chat-input-row input:focus { outline: none; border-color: var(--primary); }
    .dm-markdown p { margin: 0 0 0.5em 0; }
    .dm-markdown p:last-child { margin-bottom: 0; }
    .dm-bubble { max-width: 100%; overflow: hidden; }
    .dm-bubble img { display: block; max-width: 100%; height: auto; border-radius: 10px; cursor: zoom-in; }
    .dm-img-caption { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 3px; }
    .bottom-nav a.active, .bottom-nav button.active { color: var(--primary); }
    .bottom-nav a:hover, .bottom-nav button:hover { color: var(--primary); text-decoration: none; }
    .bottom-nav svg { width: 22px; height: 22px; }
    .fab {
      display: flex; align-items: center; justify-content: center;
      position: fixed; right: 16px;
      bottom: calc(70px + env(safe-area-inset-bottom));
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--primary); color: #fff;
      box-shadow: 0 4px 16px rgba(29,78,216,0.4);
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
      transition: transform 0.15s, box-shadow 0.15s;
      z-index: 99; text-decoration: none;
    }
    .fab:hover, .fab:active { transform: scale(1.08); text-decoration: none; color: #fff; }
    .post-wrap { border-radius: 0; border-left: none; border-right: none; max-width: 100%; padding: 10px 12px; }
    .post-card { flex-direction: column; border-radius: 8px; }
    .post-sidebar { padding: 16px 16px 0; width: 100%; flex-direction: row; display: flex; align-items: center; gap: 12px; background: transparent; border-right: none; }
    .post-avatar { width: 32px; height: 32px; font-size: 14px; }
    .topnav .right { margin-left: auto; gap: 4px; }
    .reaction-picker-btn { padding: 8px; font-size: 18px; }
  }
  @media (display-mode: standalone) {
    .topnav {
      padding-top: env(safe-area-inset-top);
    }
    .drawer-header {
      padding-top: calc(14px + env(safe-area-inset-top));
    }
  }

  /* Admin panel */
  .admin-wrap { display: flex; flex-direction: column; }
  .admin-hd { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 12px; }
  .admin-hd h1 { margin: 0; font-size: 18px; font-weight: 800; }
  .admin-nav { display: flex; gap: 6px; flex-wrap: wrap; padding-bottom: 12px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .admin-nav::-webkit-scrollbar { display: none; }
  .admin-nav a { white-space: nowrap; padding: 6px 14px; border-radius: 20px; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 600; text-decoration: none; transition: all 0.15s; }
  .admin-nav a:hover { border-color: var(--primary); color: var(--primary); }
  .admin-nav a.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .admin-ui { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; min-width: 0; }
  .admin-table-wrap, .table-scroll-wrapper, .user-table-card, .log-table-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th { text-align: left; padding: 10px 8px; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .admin-table td { padding: 10px 8px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .admin-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  @media (max-width: 768px) {
    .admin-ui { padding: 12px; }
    .admin-wrap { padding: 0 12px; }
  }

  /* Admin modal */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
  .modal-card { background: var(--card-bg); border-radius: 12px; padding: 24px; max-width: 420px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .modal-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 800; }
  .modal-card p { margin: 0 0 20px; color: var(--text-muted); font-size: 14px; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

  /* Deleted-content tabs (/mod/deleted) */
  .del-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .del-tab { padding: 8px 16px; border-radius: 9999px; background: var(--bg-color); border: 1.5px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .del-tab:hover { border-color: var(--primary); color: var(--primary); }
  .del-tab.active { background: var(--primary); border-color: var(--primary); color: white; }
  .del-list { display: flex; flex-direction: column; }
  .del-empty { padding: 48px 20px; text-align: center; color: var(--text-muted); background: var(--card-bg); border: 1.5px dashed var(--border-color); border-radius: 16px; font-size: 14px; }

  /* Archive modal (/mod/deleted) - built on .modal-overlay / .modal-card */
  .archive-modal { max-width: 460px; }
  .archive-modal p { margin-bottom: 16px; }
  .archive-modal textarea { width: 100%; }
  .archive-warn-row { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 14px; color: var(--text-main); cursor: pointer; }
  .archive-warn-row input[type="checkbox"] { width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--primary); }

  /* Warn modal (topic thread) - built on .modal-overlay / .modal-card */
  .warn-modal { max-width: 460px; }
  .warn-modal p { margin-bottom: 16px; }
  .warn-modal textarea { width: 100%; }

  /* Toggle switch (used in room access control) */
  .toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
  .toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-track { position: absolute; inset: 0; border-radius: 24px; background: var(--border-color); transition: background 0.2s; }
  .toggle input:checked ~ .toggle-track { background: var(--primary); }
  .toggle-thumb { position: absolute; left: 2px; top: 2px; width: 20px; height: 20px; background: var(--card-bg); border-radius: 50%; transition: left 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.25); pointer-events: none; }
  .toggle input:checked ~ .toggle-thumb { left: 22px; }
  .post-card.batch-selectable { cursor: pointer; }
  .post-card.batch-selected { outline: 2px solid var(--primary); background: var(--primary-hover); }
  .delete-expand { border-top: 1px solid var(--border-color); padding: 8px; margin-top: 4px; }
  .delete-expand-inner { display: flex; flex-direction: column; gap: 6px; }
  .delete-reason-input { width: 100%; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-main); font-size: 0.875rem; }
  .delete-expand-actions { display: flex; gap: 6px; flex-wrap: wrap; }

  /* CW pills */
  .cw-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
  .cw-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 700; color: #fff;
    text-decoration: none; line-height: 1.4;
  }
  .cw-pill[data-tooltip] { cursor: help; }

  /* CW blur reveal */
  .cw-blur-wrap { position: relative; }
  .cw-blur-wrap > .cw-blur-body { filter: blur(14px); transition: filter 0.2s; user-select: none; pointer-events: none; }
  .cw-blur-wrap.revealed > .cw-blur-body { filter: none; user-select: auto; pointer-events: auto; }
  .cw-blur-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.05); border-radius: 8px;
  }
  .cw-blur-wrap.revealed > .cw-blur-overlay { display: none; }
  .cw-blur-overlay button {
    padding: 8px 16px; background: var(--card-bg); border: 1.5px solid var(--border-color);
    border-radius: 8px; font-weight: 700; cursor: pointer; color: var(--text-main);
  }
  .cw-blur-overlay button:hover { border-color: var(--primary); color: var(--primary); }

  /* CW NSFW gate */
  .cw-nsfw-gate {
    padding: 18px; background: var(--bg-color); border: 1px dashed var(--border-color);
    border-radius: 8px; color: var(--text-muted); font-size: 14px; text-align: center;
  }
  .cw-nsfw-gate a { color: var(--primary); font-weight: 700; }

  /* Digit Table Styling */
  .digit-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  .digit-table th, .digit-table td { padding: 8px 12px; text-align: center; border: 1px solid var(--border-color); }
  .digit-table th { background: var(--card-bg); font-weight: 700; color: var(--text-muted); }
  .digit-table td:first-child { text-align: left; font-weight: 600; background: var(--card-bg); width: 120px; }
  .digit-table input[type="radio"] { cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary); }

  /* Engagement bot panel (chat helper + /bot page) */
  .bot-panel {
    background: var(--card-bg); border: 1px dashed var(--border-color); border-radius: 12px;
    padding: 14px 16px; margin: 10px 0; font-size: 14px; color: var(--text-main); max-width: 640px;
  }
  .bot-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bot-name { font-weight: 700; font-size: 13px; }
  .bot-only-you { font-size: 11px; color: var(--text-muted); }
  .bot-close { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; padding: 0 4px; }
  .bot-title { font-weight: 700; margin: 0 0 8px; }
  .bot-p { margin: 0 0 8px; line-height: 1.55; color: var(--text-main); }
  .bot-p a { color: var(--primary); }
  .bot-template-wrap { position: relative; margin: 0 0 10px; }
  .bot-template {
    white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 13px;
    background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px;
    padding: 10px 12px; padding-right: 58px; margin: 0; line-height: 1.5; color: var(--text-main);
  }
  .bot-copy-btn {
    position: absolute; top: 6px; right: 6px; font-size: 11px; cursor: pointer;
    background: var(--card-bg); color: var(--text-main); border: 1px solid var(--border-color);
    border-radius: 6px; padding: 2px 8px;
  }
  .bot-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .bot-opt {
    background: var(--bg-color); color: var(--text-main); border: 1px solid var(--border-color);
    border-radius: 999px; padding: 5px 12px; font-size: 13px; cursor: pointer;
  }
  .bot-opt:hover { border-color: var(--primary); color: var(--primary); }
  .bot-page { max-width: 680px; margin: 0 auto; padding: 20px 16px; }
</style>
</head>
<body data-uploads-enabled="${opts.uploadsEnabled ? 'true' : 'false'}" class="${opts.user?.show_nsfw ? 'show-nsfw' : ''}"${dockRooms.length && opts.openChatDock !== undefined ? ` data-chat-open="${esc(opts.openChatDock)}"` : ''}>${dockRooms.length ? `<script>${CHAT_DOCK_BOOT}</script>` : ''}
  <a class="skip-link" href="#main-content">Skip to content</a>
  ${renderTopnav({ user, verified, cPanelLink, userMenu, branding })}
<div class="drawer-overlay" id="drawer-overlay"></div>
${verifyBanner}
${flashBanner}
<div class="layout">
  ${renderSidebar({ user, verified, rooms, memberRooms, lockedRooms, csrfToken })}
  <main class="main" id="main-content" tabindex="-1">${
    user && (user.tos_version == null || user.tos_version < CURRENT_TOS_VERSION) && csrfToken
      ? renderTosBanner({ csrfToken, branding })
      : ''
  }${
    user && user.password_salt == null
      ? renderSaltUpgradeBanner()
      : ''
  }${body}</main>
  ${dockRooms.length && user ? renderChatDock({ user, chatRooms: dockRooms, csrfToken }) : ''}
</div>
${dockRooms.length ? renderChatDockTab() + renderChatFab() : ''}
${renderBottomNav({ user, verified, meHref })}
${renderFab({ showFab: opts.showFab !== false, verified, activeRoomSlug, fabHref })}
<div id="toast-container"></div>
<div id="heartbeat" hx-get="/api/heartbeat" hx-trigger="beat" hx-swap="none" style="display:none"></div>
    <script>${LAYOUT_SCRIPT}
    </script>
${dockRooms.length ? `<script>${CHAT_DOCK_SCRIPT}</script>` : ''}
</body>
</html>`;
}

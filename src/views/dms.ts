import type { User, DM } from '../types';
import { DM_SCRIPT } from './dms-script';
import { esc, csrfField, markdownToolbar, loadMoreButton } from './layout';
import { avatarHtml } from './profile';
import { renderMarkdown as renderSafeMarkdown } from '../lib/markdown';
import { transformVideoEmbeds } from '../lib/video-embeds';

// intentionally distinct from post.ts embedLinks: same image regex but DM
// output wraps in <figure> with the "images can be saved to device" caption.
function embedLinks(html: string): string {
  html = html.replace(
    /<p>\s*<a href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^"]*)?)">[^<]*<\/a>\s*<\/p>/gi,
    (_, url) => `<figure style="margin:8px 0;padding:0;"><img src="${url}" alt="" loading="lazy"><figcaption class="dm-img-caption">images can be saved to device</figcaption></figure>`,
  );
  return transformVideoEmbeds(html);
}

export function renderDmContent(content: string): string {
  const clean = content.replace(/\\n/g, '\n');
  return `<div class="dm-markdown">${embedLinks(renderSafeMarkdown(clean))}</div>`;
}

function fmtTime(s: string): string {
  const utc = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  return `<span class="rel-time" data-utc="${utc}">${s}</span>`;
}

/** Render the DM unread-count nav badge. Pure: empty when zero, capped at "9+". */
export function renderDmBadge(total: number): string {
  if (total <= 0) return '';
  return `<span class="dm-nav-badge">${total > 9 ? '9+' : total}</span>`;
}

/**
 * OOB fragment for the DM poll endpoint: new messages appended to #dm-thread.
 * Moved verbatim from api/dms.ts getThreadMessages.
 */
function renderDmMessages(dms: DM[], viewerId: number): string {
  return dms.map(m => {
    const mine = m.sender_id === viewerId;
    return `
      <div class="dm-msg ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
        <div class="dm-when">${fmtTime(m.created_at)}</div>
        <div class="dm-bubble">${renderDmContent(m.content)}</div>
      </div>`;
  }).join('');
}

export function renderDmPollItems(dms: DM[], viewerId: number): string {
  return `<div hx-swap-oob="beforeend:#dm-items">${renderDmMessages(dms, viewerId)}</div>`;
}

/**
 * Load-older control for a thread. Sits ABOVE #dm-items, inside the #dm-thread
 * scroller, so neither the 20s poll's ":last-child" cursor nor the beforeend
 * append of new messages can collide with it.
 *
 * Plain hx-get with the cursor in the URL - no hx-vals js:, no inline script.
 * The thread already forces CSP unsafe-eval via one js: expression; do not add
 * another.
 */
export function renderDmOlder(otherName: string, nextBeforeId: number | null): string {
  return loadMoreButton({
    id: 'dm-older',
    href: nextBeforeId ? `/api/dms/${encodeURIComponent(otherName)}/older?before=${nextBeforeId}` : null,
    label: 'Load older messages',
  });
}

/** Older-page fragment: fresh control + OOB prepend into the message list. */
export function renderDmOlderPage(
  otherName: string,
  dms: DM[],
  viewerId: number,
  nextBeforeId: number | null,
): string {
  return `${renderDmOlder(otherName, nextBeforeId)}<div hx-swap-oob="afterbegin:#dm-items">${renderDmMessages(dms, viewerId)}</div>`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export interface ConversationRow {
  other: User;
  lastContent: string;
  lastAt: string;
  unread: number;
}

/** One page of inbox rows. Shared by the full list and the load-more fragment. */
export function renderConversationRows(conversations: ConversationRow[], onlineNames?: Set<string>): string {
  return conversations.map(c => {
        const avatar = c.other.avatar_url
          ? `<img src="${esc(c.other.avatar_url)}" class="dm-avatar">`
          : `<span class="dm-avatar" style="background:${esc(c.other.avatar_color || '#6366f1')}">${esc((c.other.display_name || '?').slice(0, 2).toUpperCase())}</span>`;
        const isOnline = onlineNames?.has(c.other.display_name || '') ?? false;

        return `
        <a href="/dms/${esc(c.other.display_name || '')}" class="inbox-item${c.unread > 0 ? ' is-unread' : ''}">
          <div class="inbox-av-wrap">
            ${avatar}
            <div class="inbox-status" style="background:${isOnline ? '#10b981' : '#9ca3af'};"></div>
          </div>
          <div class="inbox-det">
            <div class="inbox-hd">
              <strong class="inbox-nm">${esc(c.other.display_name || '(deleted)')}</strong>
              <span class="inbox-tm">${fmtTime(c.lastAt)}</span>
            </div>
            <div class="inbox-pv">
              <span class="inbox-txt">${esc(truncate(c.lastContent, 100))}</span>
              ${c.unread > 0 ? `<span class="inbox-bc">${c.unread}</span>` : ''}
            </div>
          </div>
        </a>`;
      }).join('');
}

/**
 * Load-more control for the inbox. Plain hx-get, cursor in the URL.
 *
 * Lives under /api/dms/, NOT /dms/page: the /dms/:name namespace is display
 * names, so a member called "page" would shadow the route.
 */
export function renderConversationsMore(nextBeforeId: number | null): string {
  return loadMoreButton({
    id: 'inbox-more',
    href: nextBeforeId ? `/api/dms/page?before=${nextBeforeId}` : null,
    label: 'Load older conversations',
  });
}

/** Load-more fragment: fresh control + OOB append into the row list. */
export function renderConversationsPage(
  conversations: ConversationRow[],
  onlineNames: Set<string> | undefined,
  nextBeforeId: number | null,
): string {
  return `${renderConversationsMore(nextBeforeId)}<div hx-swap-oob="beforeend:#inbox-items">${renderConversationRows(conversations, onlineNames)}</div>`;
}

export function renderConversations(opts: {
  user: User;
  conversations: ConversationRow[];
  nextBeforeId?: number | null;
  onlineNames?: Set<string>;
  csrfToken?: string;
  vapidPublicKey?: string;
}): string {
  const { conversations, onlineNames, csrfToken, vapidPublicKey } = opts;

  const nextBeforeId = opts.nextBeforeId ?? null;

  // Only a genuinely empty inbox gets the empty state. A page that renders no
  // rows but HAS a further cursor (every summary resolved to a deleted user)
  // must still emit the list container and the control, or older conversations
  // become permanently unreachable.
  const list = conversations.length === 0 && !nextBeforeId
    ? `<div style="text-align:center;padding:40px;color:var(--text-muted);background:var(--card-bg);border-radius:12px;border:1px solid var(--border-color);margin:20px;">No conversations yet.</div>`
    : `<div class="inbox-list"><div id="inbox-items">${renderConversationRows(conversations, onlineNames)}</div>${renderConversationsMore(nextBeforeId)}</div>`;

  return `
    <style>
      .inbox-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
      @media not all and (max-width: 768px) { .inbox-wrap { height: auto; margin-top: -10px; } }

      .inbox-hdr { 
        display: flex; align-items: center; justify-content: space-between; 
        padding: 12px 20px; border-bottom: 1px solid var(--border-color); 
        background: var(--card-bg); flex-shrink: 0;
      }
      .inbox-hdr h1 { margin: 0; font-size: 20px; font-weight: 800; color: var(--text-main); }
      
      .inbox-list { flex: 1; overflow-y: auto; background: var(--bg-color); }
      
      .inbox-item { 
        display: flex; gap: 14px; padding: 14px 20px; 
        border-bottom: 1px solid var(--border-color); 
        text-decoration: none; color: inherit; transition: background 0.2s;
      }
      .inbox-item:hover { background: var(--card-bg); }
      .inbox-item.is-unread { background: var(--highlight-bg); }
      
      .inbox-av-wrap { position: relative; flex-shrink: 0; }
      .dm-avatar { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); border: 2px solid #fff; }
      .inbox-status { position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; border: 2.5px solid var(--bg-color); }
      
      .inbox-det { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
      .inbox-hd { display: flex; justify-content: space-between; align-items: baseline; }
      .inbox-nm { font-size: 16px; font-weight: 700; color: var(--text-main); }
      .inbox-tm { font-size: 11px; color: var(--text-muted); font-weight: 500; }
      
      .inbox-pv { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .inbox-txt { font-size: 14px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .inbox-bc { background: #1d4ed8; color: #fff; border-radius: 10px; padding: 0 8px; font-size: 10px; font-weight: 900; height: 18px; display: flex; align-items: center; }

      @media (max-width: 768px) {
        .inbox-wrap { position: fixed; top: 64px; bottom: calc(62px + env(safe-area-inset-bottom)); left: 0; right: 0; z-index: 50; background: var(--bg-color); }
        .inbox-item { padding: 12px 16px; }
        .dm-avatar { width: 48px; height: 48px; }
        body:has(.inbox-wrap) { overflow: hidden; position: fixed; width: 100%; }
        body:has(.inbox-wrap) .layout { margin: 0 !important; padding: 0 !important; }
        body:has(.inbox-wrap) .main { padding: 0 !important; }
      }
      @media (display-mode: standalone) and (max-width: 768px) {
        .inbox-wrap { top: calc(64px + env(safe-area-inset-top)); }
      }
    </style>

    <div class="inbox-wrap">
      <header class="inbox-hdr">
        <h1>Inbox</h1>
        ${vapidPublicKey ? `<button id="dm-push-btn" class="btn btn-sm" data-vapid-key="${esc(vapidPublicKey)}" style="background:#1d4ed8; border-radius:8px;">Enable Notifications</button>` : ''}
      </header>
      ${list}
    </div>
  `;
}

export function renderThread(opts: {
  user: User;
  other: User;
  dms: DM[];
  /** Cursor for older history; null when the thread start is already loaded. */
  nextBeforeId?: number | null;
  isOnline?: boolean;
  composeContent?: string;
  error?: string;
  csrfToken?: string;
  vapidPublicKey?: string;
}): string {
  const { user, other, dms, isOnline, composeContent, error, csrfToken, vapidPublicKey } = opts;

  const messages = dms.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px;">No messages yet. Say hi.</div>`
    : renderDmMessages(dms, user.id);

  const errorHtml = error ? `<div class="flash flash-warn" style="margin:4px 12px;">${esc(error)}</div>` : '';
  const otherName = esc(other.display_name || '');

  return `
    <style>
      .dm-wrap { 
        display: flex; flex-direction: column; 
        height: 100%; min-height: 0;
      }
      
      @media not all and (max-width: 768px) {
        .dm-wrap { 
          height: calc(100vh - 104px);
          margin: -20px 0;
        }
        .dm-hd-right { display: flex; align-items: center; gap: 12px; }
        .dm-hd-right .mobile-hide { display: flex; }
      }

      .dm-hd { 
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 20px; border-bottom: 1px solid var(--border-color);
        background: var(--card-bg); flex-shrink: 0;
      }
      .dm-hd-left { display: flex; align-items: center; gap: 16px; }
      .dm-hd-right { display: flex; align-items: center; gap: 8px; }
      .dm-back { color: var(--text-main); display: flex; align-items: center; padding: 4px; }
      .dm-user-info { display: flex; align-items: center; gap: 12px; }
      .dm-user-av-wrap { position: relative; width: 40px; height: 40px; }
      .dm-user-status { width: 10px; height: 10px; border-radius: 50%; background: #10b981; border: 2px solid var(--card-bg); position: absolute; bottom: 0; right: 0; }
      .dm-user-det h2 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main); }
      .dm-user-det p { margin: 0; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }

      .dm-ui {
        flex: 1; display: flex; flex-direction: column; min-height: 0;
        background: var(--bg-color); position: relative;
      }

      .dm-thread { 
        flex: 1; display: flex; flex-direction: column; gap: 16px; 
        padding: 24px 40px; overflow-y: auto; 
        scrollbar-width: thin;
      }
      
      /* #dm-items exists only as a stable swap target for the load-older
         prepend and the new-message append. It must NOT create a layout box:
         .dm-msg below uses align-self, which only works on a direct flex item
         of .dm-thread. With a normal wrapper the bubbles collapse to
         left-pinned 60%-wide blocks and "mine" lands mid-page instead of at
         the right edge. display:contents keeps the element targetable while
         leaving .dm-thread's flex layout and gap exactly as they were. */
      #dm-items { display: contents; }

      /* Wide on desktop, bounded on ultrawide. 92% matches the chat view (the
         other chat-shaped surface); the ch ceiling only binds past ~1000px of
         column width, so a 2560px monitor stops at ~915px instead of 1450px.
         Mobile keeps its own 85% below. */
      .dm-msg { display: flex; flex-direction: column; max-width: min(var(--measure-chat), var(--measure-chat-max)); position: relative; }
      .dm-msg.mine { align-self: flex-end; align-items: flex-end; }
      .dm-msg.theirs { align-self: flex-start; align-items: flex-start; }
      
      .dm-when { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
      
      .dm-bubble { 
        padding: 12px 20px; border-radius: 20px; 
        font-size: 14.5px; line-height: 1.5;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      .dm-bubble a { color: inherit; text-decoration: underline; font-weight: 600; }
      .dm-msg.mine .dm-bubble a { color: #fff; }
      .dm-msg.theirs .dm-bubble a { color: var(--primary); }
      .dm-bubble .dm-markdown p:last-child { margin-bottom: 0; }
      .dm-msg.mine .dm-bubble { background: #1d4ed8; color: #fff; }
      .dm-msg.theirs .dm-bubble { background: var(--card-bg); color: var(--text-main); border: 1px solid var(--border-color); }
      
      .dm-compose-wrap {
        padding: 20px 40px 32px; flex-shrink: 0;
        background: var(--bg-color);
      }
      .dm-pill-input {
        display: flex; align-items: center; gap: 12px;
        background: var(--card-bg); border: 1.5px solid var(--border-color);
        border-radius: 32px; padding: 6px 12px 6px 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .dm-pill-input:focus-within { border-color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
      
      .dm-pill-input textarea { 
        flex: 1; min-height: 24px; max-height: 200px;
        border: none; background: transparent; color: var(--text-main);
        font: inherit; font-size: 15px; resize: none; padding: 10px 0;
      }
      .dm-pill-input textarea:focus { outline: none; }
      
      .dm-tool-btn { 
        width: 32px; height: 32px; border-radius: 50%; border: none;
        background: none; color: var(--text-muted); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.15s;
      }
      .dm-tool-btn:hover { background: var(--bg-color); color: var(--text-main); }
      
      .dm-send-pill {
        width: 40px; height: 40px; border-radius: 50%;
        background: #1d4ed8; color: #fff; border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: transform 0.1s;
      }
      .dm-send-pill:active { transform: scale(0.9); }

      .dm-mobile-toolbar { display: none; }
      .dm-mobile-only { display: none; }
      .dm-push-icon { display: inline-block; }
      /* Enabled state: collapse to a small icon-only badge instead of a wide text pill */
      .dm-push-mobile[disabled] {
        background: var(--success) !important; border-color: var(--success) !important;
        color: #fff !important; opacity: 1 !important; cursor: default !important;
        width: 32px !important; height: 32px !important; padding: 0 !important;
        border-radius: 50% !important; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .dm-push-mobile[disabled] .dm-push-label { display: none !important; }

      .mobile-hide { display: none; }

      @media (max-width: 768px) {
        .dm-wrap { 
          position: fixed; top: 64px; bottom: calc(62px + env(safe-area-inset-bottom));
          left: 0; right: 0; height: auto; margin: 0; z-index: 50;
        }
        .dm-hd { padding: 8px 16px; height: 56px; }
        .dm-hd-right .btn-sm { display: none; }
        .dm-hd-right .dm-push-mobile { display: inline-flex; padding: 5px 8px; font-size: 11px; white-space: nowrap; }
        .dm-thread { padding: 16px; }
        .dm-msg { max-width: 85%; }
        .dm-compose-wrap { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
        .dm-pill-input { padding: 4px 4px 4px 14px; gap: 6px; align-items: center; }
        .dm-pill-input textarea {
          font-size: 14px;
          min-height: 20px;
          padding: 0;
          line-height: 20px;
        }
        .dm-send-pill { width: 32px; height: 32px; }
        .dm-send-pill svg { width: 16px; height: 16px; }
        .dm-pill-input .md-tool-btn { display: none; }
        .dm-pill-input .dm-left-tools { display: none !important; }
        .dm-mobile-toolbar {
          display: inline-flex;
          align-self: flex-start;
          align-items: center;
          gap: 2px;
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 2px 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .dm-mobile-toolbar .dm-tool-btn { width: 28px; height: 28px; }
        .dm-mobile-only { display: inline-flex; }
        
        body:has(.dm-wrap) { overflow: hidden; position: fixed; width: 100%; }
        body:has(.dm-wrap) .layout { margin: 0 !important; padding: 0 !important; }
        body:has(.dm-wrap) .main { padding: 0 !important; }
      }
      
      @media (display-mode: standalone) and (max-width: 768px) {
        .dm-wrap { top: calc(64px + env(safe-area-inset-top)); }
      }
    </style>

    <div class="dm-wrap">
      <div id="dm-root" data-other="${esc(other.display_name || '')}" data-me="${esc(user.display_name || '')}" style="display:none"></div>
      <div class="dm-hd">
        <div class="dm-hd-left">
          <a href="/dms" hx-get="/dms" hx-target=".main" hx-push-url="true" class="dm-back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </a>
          <div class="dm-user-info">
            <a href="/u/${otherName}" hx-get="/u/${otherName}" hx-target=".main" hx-push-url="true" class="dm-user-av-wrap" title="View profile" style="display:block; text-decoration:none;">
              ${avatarHtml(other.display_name ?? '?', other.avatar_color ?? '#6366f1', 40, other.avatar_url)}
              <div class="dm-user-status" style="background:${isOnline ? '#10b981' : '#9ca3af'}"></div>
            </a>
            <div class="dm-user-det">
              <h2>${otherName}</h2>
              <p><span class="dm-status-dot" style="display:inline-block; width:6px; height:6px; background:${isOnline ? '#10b981' : '#9ca3af'}; border-radius:50%;"></span> <span id="dm-status-text">${isOnline ? 'online' : 'offline'}</span><span id="dm-typing" style="display:none; color:var(--primary);">typing…</span></p>
            </div>
          </div>
        </div>
        <div class="dm-hd-right">
          ${vapidPublicKey ? `<button id="dm-push-btn" class="action-btn dm-push-mobile" data-vapid-key="${esc(vapidPublicKey)}" style="background:var(--primary); border-color:var(--primary); color:#fff;" title="Enable Notifications"><svg class="dm-push-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dm-push-label">mobile notifications</span></button>` : ''}
          <a href="/u/${otherName}" hx-get="/u/${otherName}" hx-target=".main" hx-push-url="true" class="action-btn" style="padding:8px 14px; background:var(--bg-color);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Profile</a>
          <button class="icon-btn mobile-hide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
          <button class="icon-btn mobile-hide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>
        </div>
      </div>

      <div class="dm-ui">
        <div class="dm-thread" id="dm-thread"
             hx-get="/api/dms/${otherName}/messages"
             hx-trigger="every 20s"
             hx-vals='js:{since: (document.querySelector("#dm-items .dm-msg:last-child") || {}).dataset?.id || 0}'
             hx-swap="none">${renderDmOlder(other.display_name || '', opts.nextBeforeId ?? null)}<div id="dm-items">${messages}</div></div>
        ${errorHtml}
        
        <form class="dm-compose-wrap" hx-post="/dms" hx-target=".main">
          ${csrfField(opts)}
          <input type="hidden" name="to" value="${otherName}">
          <input type="hidden" name="to_id" value="${other.id}">
          <div class="dm-mobile-toolbar">
            <button type="button" class="dm-tool-btn" onclick="triggerUpload('dm-textarea')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></button>
          </div>
          <div class="dm-pill-input">
            <div class="dm-left-tools" style="display:flex; align-items:center; gap:4px; padding-right:12px; border-right:1px solid var(--border-color); margin-right:4px;">
              <button type="button" class="dm-tool-btn" onclick="insertMd('dm-textarea', '[', '](url)')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>
              <button type="button" class="dm-tool-btn" onclick="triggerUpload('dm-textarea')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></button>
              <button type="button" class="dm-tool-btn" onclick="togglePreview('dm-textarea', 'dm-preview')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg></button>
            </div>
            <textarea id="dm-textarea" name="content" required minlength="1" maxlength="4000" rows="1"
              placeholder="Message..." autocomplete="off">${esc(composeContent || '')}</textarea>
            <div style="display:flex; align-items:center; gap:4px; padding-left:12px; border-left:1px solid var(--border-color); margin-left:4px;">
              <div class="mobile-hide" style="background:#f1f5f9; border-radius:6px; padding:2px 6px; font-size:12px; font-weight:700; color:#475569; margin-right:4px;">Aa</div>
              <button type="button" class="dm-tool-btn" onclick="insertMd('dm-textarea', '**', '**')" style="font-weight:900; font-family:serif; font-size:16px;">B</button>
              <button type="button" class="dm-tool-btn" onclick="insertMd('dm-textarea', '*', '*')" style="font-style:italic; font-family:serif; font-size:18px;">/</button>
              <button type="button" class="dm-tool-btn dm-mobile-only" onclick="insertMd('dm-textarea', '[', '](url)')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>
              <button type="button" class="dm-tool-btn mobile-hide" onclick="insertMd('dm-textarea', '- ', '')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
            </div>
            <button class="dm-send-pill" type="submit" title="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
              </svg>
            </button>
          </div>
          <div id="dm-preview" class="post-body" role="status" aria-live="polite" style="display:none; padding:12px; border:1px solid var(--border-color); border-radius:12px; background:var(--card-bg); margin-top:8px; max-height:200px; overflow-y:auto;"></div>
        </form>
      </div>
    </div>

    <script>${DM_SCRIPT}
    </script>

  `;
}

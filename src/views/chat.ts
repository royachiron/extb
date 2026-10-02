// layout-utils, not ./layout: layout.ts renders the chat dock, so importing
// ./layout here would close an import cycle (layout -> chat-dock -> chat).
import { esc, csrfField } from './layout-utils';
import type { User, Room } from '../types';
import {
  chatBubble, chatHeader, chatReactionPill, chatAddBtn, chatReplyBtn, chatBotItem,
  chatPendingMatch, chatSendDelay,
  chatNick, chatParseCommand, chatMeRest, chatActionBody, chatIsMention, chatMarkMention,
} from './chat-message';
import { CHAT_SCRIPT_BOOT, chatMainScript } from './chat-scripts';

// The shared bubble-markup builders run BOTH server-side (imported above and in
// src/api/chat.ts) and client-side: there is no client bundler, so we inject the
// functions' own source into the inline <script> and the browser redefines them.
// They are pure + closure-free, so the serialized source is self-contained. The
// `var X =` binding name is supplied here, surviving any esbuild renaming of the
// bundled worker. Builders use `+` concatenation (no backticks / `${}`) so this
// embeds safely inside the outer template literal.
const CHAT_BUILDERS_SRC =
  'var chatBubble = ' + chatBubble.toString() + ';\n' +
  'var chatHeader = ' + chatHeader.toString() + ';\n' +
  'var chatReactionPill = ' + chatReactionPill.toString() + ';\n' +
  'var chatAddBtn = ' + chatAddBtn.toString() + ';\n' +
  'var chatReplyBtn = ' + chatReplyBtn.toString() + ';\n' +
  'var chatBotItem = ' + chatBotItem.toString() + ';\n' +
  'var chatPendingMatch = ' + chatPendingMatch.toString() + ';\n' +
  'var chatSendDelay = ' + chatSendDelay.toString() + ';\n' +
  'var chatNick = ' + chatNick.toString() + ';\n' +
  'var chatParseCommand = ' + chatParseCommand.toString() + ';\n' +
  'var chatMeRest = ' + chatMeRest.toString() + ';\n' +
  'var chatActionBody = ' + chatActionBody.toString() + ';\n' +
  'var chatIsMention = ' + chatIsMention.toString() + ';\n' +
  'var chatMarkMention = ' + chatMarkMention.toString() + ';\n';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
// Forum-thread shorthand: bare `t/<shortId>` optionally with a `#post-<anchor>`.
// Boundary-capture guard `(^|[^\w/])` (NOT lookbehind) blocks `/t/` inside a
// full URL and letter-preceded `foot/...`, while staying ES5-safe so the client
// twin (a regex literal) parses on old Safari. The captured `pre` is re-emitted.
const THREAD_RE = /(^|[^\w\/])t\/([A-Za-z0-9]{3,12})(#post-[A-Za-z0-9]+)?/g;

// Avatar color + initials for the participants list, moved verbatim from
// api/chat.ts. Palette hex values are deliberate (avatar backgrounds, same
// pattern as AVATAR_PALETTE) - not theme tokens.
function nameColor(name: string): string {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length] ?? colors[0]!;
}

function userInitials(name: string): string {
  return name.replace(/^\[guest\]\s*/, '').substring(0, 2).toUpperCase();
}

/**
 * OOB fragment: the "Online" participants panel, swapped whole on every chat
 * poll. Moved verbatim from api/chat.ts getChatMessagesApi.
 */
export function renderChatParticipants(activeNames: string[]): string {
  return `
    <div id="chat-participants" hx-swap-oob="true">
      <p class="chat-users-label"><!--extb-ui-->Online<!--/extb-ui--></p>
      <ul style="list-style:none;padding:0;margin:0;">
        ${activeNames.length === 0
          ? `<li style="font-size:12px;color:var(--text-muted);"><!--extb-ui-->No one yet<!--/extb-ui--></li>`
          : activeNames.map(name => {
              const isGuest = name.startsWith('[guest]');
              const displayName = name.replace(/^\[guest\]\s*/, '');
              const userLink = isGuest ? `<span class="chat-user-nm">${esc(displayName)}</span>` : `<button type="button" class="chat-user-nm chat-nick" data-nick="${esc(displayName)}">${esc(displayName)}</button>`;
              return `
          <li class="chat-user-item"${isGuest ? '' : ` data-nick="${esc(displayName)}"`}>
            <div class="chat-user-av" style="background:${nameColor(name)}">${esc(userInitials(name))}</div>
            ${userLink}
          </li>`;
            }).join('')}
      </ul>
    </div>`;
}

export function linkifyChat(text: string, origin?: string): string {
  // Escape first, then thread-shorthand BEFORE URL_RE. Thread refs become <a> so
  // URL_RE never sees their `/`; the guard means a real URL's `/t/` is skipped.
  const escaped = esc(text).replace(
    THREAD_RE,
    (_m, pre: string, id: string, anchor?: string) =>
      `${pre}<a href="/t/${id}${anchor || ''}" class="chat-link">t/${id}${anchor || ''}</a>`,
  );
  return escaped.replace(URL_RE, (raw) => {
    const stripTrailing = raw.match(/^(.+?)([.,;:!?)\]]+)$/);
    const url = stripTrailing ? stripTrailing[1]! : raw;
    const tail = stripTrailing ? stripTrailing[2]! : '';
    let urlOrigin = '';
    let path = '';
    try {
      const u = new URL(url);
      urlOrigin = u.origin;
      path = u.pathname + u.search + u.hash;
    } catch {
      return raw;
    }
    let internal = false;
    if (origin) { try { internal = urlOrigin === new URL(origin).origin; } catch { /* Invalid origin has no internal links. */ } }
    if (internal) {
      return `<a href="${path || '/'}" class="chat-link">${url}</a>${tail}`;
    }
    return `<a href="${url}" target="_blank" rel="noopener nofollow ugc" class="chat-link chat-link-ext">${url}</a>${tail}`;
  });
}

export function renderChat(opts: { user: User | null; csrfToken?: string; guestName?: string; rooms?: Room[]; activeSlug?: string; botName?: string; dock?: boolean }): string {
  const { user, csrfToken, guestName, rooms = [], activeSlug = 'chat', botName, dock = false } = opts;
  const isMod = user && ['mod', 'admin'].includes(user.access_level);

  const guestIndicator = !user && guestName
    ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;padding:0 4px;">Chatting as <strong>${esc(guestName)}</strong></div>`
    : '';

  // Horizontal room switcher. On the /chat page each tab is a full page nav
  // (one WS per page) and only shows with 2+ rooms. In the dock the tabs are
  // buttons: the client switches the socket in place, no navigation, and the
  // tab row always shows so you can see which room you are in.
  const roomTabs = dock
    ? `<nav class="chat-rooms" aria-label="Chat rooms">${rooms.map(r => {
        const active = r.slug === activeSlug;
        return `<button type="button" class="chat-room-tab${active ? ' active' : ''}" data-chat-room="${esc(r.slug)}"${active ? ' aria-current="true"' : ''}>${esc(r.name)}</button>`;
      }).join('')}</nav>`
    : rooms.length > 1
    ? `<nav class="chat-rooms" aria-label="Chat rooms">${rooms.map(r => {
        const active = r.slug === activeSlug;
        return `<a class="chat-room-tab${active ? ' active' : ''}" href="/chat?room=${encodeURIComponent(r.slug)}"${active ? ' aria-current="page"' : ''}>${esc(r.name)}</a>`;
      }).join('')}</nav>`
    : '';
  // Desktop/tablet: one » hide button. Phone: one size button that steps the
  // floating window default -> large -> closed (icon shows the next step).
  const dockClose = dock
    ? `<button type="button" class="chat-dock-x" data-chat-dock-close aria-label="Hide chat" data-extb-i18n-aria-label="Hide chat" title="Hide chat" data-extb-i18n-title="Hide chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg></button>` +
      `<button type="button" class="chat-dock-m chat-dock-cycle" data-chat-dock-cycle aria-label="Make chat larger" data-extb-i18n-aria-label="Make chat larger" title="Larger" data-extb-i18n-title="Larger">` +
        `<svg class="chat-cycle-grow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>` +
        `<svg class="chat-cycle-close" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>` +
      `</button>`
    : '';

  return `
<style>
  .chat-wrap { 
    display: flex; flex-direction: column; 
    height: calc(100vh - 128px); /* 64px header + padding */
    margin-top: -10px;
  }
  .chat-hd { 
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 4px 8px; flex-shrink: 0; 
  }
  .chat-hd h1 { margin: 0; font-size: 16px; font-weight: 800; }
  .chat-hd p { margin: 0; font-size: 11px; color: var(--text-muted); font-weight: 500; }

  /* Room switcher tabs */
  .chat-rooms {
    display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto;
    min-width: 0; scrollbar-width: thin; margin-right: 8px;
  }
  .chat-room-tab {
    flex-shrink: 0;
    padding: 4px 12px; border-radius: 16px;
    font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap;
    color: var(--text-muted);
    background: var(--bg-color);
    border: 1px solid var(--border-color);
  }
  .chat-room-tab:hover { color: var(--text-main); border-color: var(--primary); }
  .chat-room-tab.active {
    color: #fff; background: var(--primary); border-color: var(--primary);
  }
  
  .chat-ui {
    flex: 1; display: flex; min-height: 0;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
  }
  
  /* Online Participants */
  .chat-users {
    width: 180px; flex-shrink: 0;
    border-left: 1px solid var(--border-color);
    background: var(--bg-color);
    overflow-y: auto; padding: 12px;
  }
  .chat-users-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0 0 10px; }
  .chat-user-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-width: 0; }
  .chat-user-av { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #fff; background: var(--primary); position: relative; }
  .chat-user-av::after { content: ''; position: absolute; bottom: 0; right: 0; width: 6px; height: 6px; border-radius: 50%; background: #10b981; border: 1.5px solid var(--bg-color); }
  .chat-user-nm { font-size: 12px; font-weight: 600; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-bot-item-btn { display: flex; align-items: center; gap: 8px; min-width: 0; background: none; border: none; padding: 0; cursor: pointer; text-align: left; width: 100%; }
  .chat-bot-item-btn:hover .chat-user-nm { color: var(--primary); }
  .chat-bot-av { background: var(--card-bg); border: 1px solid var(--border-color); font-size: 12px; }
  .chat-bot-av::after { content: none; }

  .chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
  #chat-messages { 
    flex: 1; overflow-y: auto; padding: 12px; 
    display: flex; flex-direction: column; gap: 6px;
    scrollbar-width: thin;
  }
  
  /* Message Bubbles - Master UI Style */
  .chat-message { 
    padding: 5px 9px; border-radius: 8px;
    background: var(--bg-color); 
    border: 1px solid var(--border-color);
    max-width: 92%;
    align-self: flex-start;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .chat-message.is-me {
    align-self: flex-end;
    background: var(--highlight-bg);
    border-color: var(--primary);
  }
  /* Optimistic send: shown instantly, confirmed by the server echo. */
  .chat-message.chat-pending { opacity: 0.6; border-style: dashed; }
  .chat-message.chat-failed { opacity: 1; border-style: solid; border-color: var(--danger); }
  .chat-retry {
    background: none; border: none; cursor: pointer; padding: 0 4px;
    color: var(--danger); font-size: 11px; font-weight: 700; text-decoration: underline;
  }

  /* IRC-style functions */
  .chat-nick {
    background: none; border: none; padding: 0; margin: 0; cursor: pointer;
    font: inherit; font-weight: 700; color: inherit; border-radius: 4px; text-align: left;
  }
  .chat-nick:hover, .chat-nick:focus-visible { text-decoration: underline; text-underline-offset: 2px; }
  .chat-nick.open { background: var(--highlight-bg); }
  .chat-users .chat-nick { font-size: 12px; font-weight: 600; color: var(--text-main); }
  .chat-user-item[data-nick] { cursor: pointer; }
  .chat-message.chat-mention { background: var(--warn-bg); border-color: var(--warning); }
  .chat-message.chat-ignored { display: none; }
  .chat-action { font-style: italic; color: var(--text-muted); }
  .chat-sys { font-size: 11px; color: var(--text-muted); padding: 0 9px; }

  /* Name menu: popover on desktop, bottom sheet on phone */
  #chat-nick-scrim { display: none; }
  #chat-nick-menu {
    position: fixed; z-index: 1200; width: 280px; max-height: 80vh; overflow-y: auto; box-sizing: border-box;
    background: var(--card-bg); color: var(--text-main);
    border: 1px solid var(--border-color); border-radius: 12px;
    box-shadow: 0 18px 40px -12px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.08);
  }
  #chat-nick-menu[hidden] { display: none; }
  .cnm-card { padding: 14px 16px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 10px; }
  .cnm-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .cnm-av { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; overflow: hidden; }
  .cnm-av img { width: 100%; height: 100%; object-fit: cover; }
  .cnm-name { font-weight: 800; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cnm-meta { font-size: 12px; color: var(--text-muted); }
  .cnm-badges { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .cnm-items { padding: 6px 0; }
  .cnm-item {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 0 16px;
    box-sizing: border-box; border: none; background: none; cursor: pointer; text-align: left;
    color: var(--text-main); font: inherit; font-size: 14px; font-weight: 500; text-decoration: none;
  }
  .cnm-item:hover, .cnm-item:focus-visible { background: var(--bg-color); text-decoration: none; color: var(--text-main); }
  .cnm-item.danger { color: var(--danger); }
  .cnm-kb { margin-left: auto; font-size: 11px; color: var(--text-muted); font-family: ui-monospace, Menlo, monospace; }
  .cnm-sep { height: 1px; background: var(--border-color); margin: 6px 0; }
  .cnm-label { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); padding: 4px 16px; }
  .cnm-loading { padding: 16px; font-size: 13px; color: var(--text-muted); }
  .cnm-slot > div:not(:empty) { padding: 0 16px 10px; }

  /* Command + @name hints above the input */
  .chat-input-row { position: relative; }
  #chat-hints {
    position: absolute; left: 12px; right: 12px; bottom: calc(100% + 6px); z-index: 20;
    background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px;
    box-shadow: 0 14px 32px -10px rgba(0,0,0,0.3); overflow: hidden;
  }
  #chat-hints[hidden] { display: none; }
  .chat-hint {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 4px 14px;
    box-sizing: border-box; border: none; background: none; cursor: pointer; text-align: left;
    color: var(--text-main); font: inherit; font-size: 13px;
  }
  .chat-hint.sel { background: var(--highlight-bg); }
  .chat-hint-cmd { font-family: ui-monospace, Menlo, monospace; font-weight: 700; color: var(--primary); min-width: 88px; }
  .chat-hint-desc { color: var(--text-muted); font-size: 12.5px; }
  .chat-hint-foot { font-size: 11px; color: var(--text-muted); padding: 6px 14px; border-top: 1px solid var(--border-color); }
  .chat-msg-hd { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
  .chat-msg-author { font-weight: 700; font-size: 13px; color: var(--primary); }
  .chat-time { font-size: 9px; color: var(--text-muted); font-weight: 500; }
  .chat-msg-body { font-size: 13.5px; color: var(--text-main); word-break: break-word; line-height: 1.4; }

  /* Quote / reply */
  .chat-reply-quote {
    font-size: 11.5px; color: var(--text-muted);
    border-left: 2px solid var(--border-color);
    padding: 1px 0 1px 6px; margin-bottom: 3px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
  }
  .chat-reply-author { font-weight: 700; color: var(--primary); }
  .chat-reply-btn {
    margin-left: 6px; background: none; border: none; cursor: pointer;
    color: var(--text-muted); font-size: 12px; font-weight: 700;
    padding: 0 4px; line-height: 1; flex-shrink: 0;
  }
  .chat-reply-btn:hover { color: var(--primary); }

  /* Typing indicator */
  #chat-typing {
    font-size: 11px; color: var(--text-muted); font-style: italic;
    min-height: 14px; line-height: 14px; padding: 0 8px 2px;
  }

  /* Pending-reply bar above the input */
  #chat-reply-bar {
    display: none; align-items: center; gap: 8px;
    font-size: 11.5px; color: var(--text-muted);
    background: var(--bg-color); border: 1px solid var(--border-color);
    border-radius: 8px; padding: 4px 8px; margin-bottom: 6px;
  }
  #chat-reply-bar.active { display: flex; }
  #chat-reply-bar .chat-reply-bar-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  #chat-reply-cancel {
    background: none; border: none; cursor: pointer; color: var(--text-muted);
    font-size: 14px; font-weight: 700; line-height: 1; padding: 0 4px; flex-shrink: 0;
  }
  #chat-reply-cancel:hover { color: var(--danger); }
  .chat-link { color: var(--primary); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
  .chat-link:hover { color: var(--primary-hover); }
  .chat-link-ext::after { content: " ↗"; font-size: 0.85em; opacity: 0.7; }

  /* Emoji reactions (room chat only) */
  .chat-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
  .chat-reactions:empty { display: none; }
  .chat-react-pill {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 7px; border-radius: 12px; cursor: pointer;
    font-size: 12px; line-height: 1.5;
    background: var(--bg-color); border: 1px solid var(--border-color);
    color: var(--text-main);
  }
  .chat-react-pill:hover { border-color: var(--primary); }
  .chat-react-pill.is-mine { background: var(--highlight-bg); border-color: var(--primary); color: var(--primary); }
  .chat-react-pill .chat-react-n { font-weight: 700; font-size: 11px; }
  .chat-react-add {
    width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
    background: none; border: 1px solid var(--border-color);
    color: var(--text-muted); font-size: 13px; line-height: 1; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center; opacity: 0.5;
  }
  .chat-react-add:hover { opacity: 1; color: var(--primary); border-color: var(--primary); }
  .chat-react-palette {
    display: inline-flex; gap: 2px; flex-wrap: wrap;
    background: var(--card-bg); border: 1px solid var(--border-color);
    border-radius: 14px; padding: 2px 5px; margin-left: 4px;
  }
  .chat-react-palette button {
    background: none; border: none; cursor: pointer; font-size: 15px;
    padding: 1px 3px; line-height: 1; border-radius: 6px;
  }
  .chat-react-palette button:hover { background: var(--highlight-bg); }
  
  .chat-input-row {
    flex-shrink: 0;
    border-top: 1px solid var(--border-color);
    padding: 8px 12px;
    background: var(--card-bg);
  }
  .chat-input-inner { display: flex; gap: 8px; align-items: center; }
  .chat-input-row input[type="text"] {
    flex: 1; padding: 8px 14px;
    border: 1px solid var(--border-color); border-radius: 20px;
    font-size: 14px; background: var(--bg-color);
    width: auto; height: 36px;
  }
  .chat-send-btn {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: var(--primary); color: #fff;
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  #chat-error { font-size: 11px; color: var(--danger); font-weight: 600; margin-top: 4px; padding: 0 8px; }

  /* Dock variant (src/views/chat-dock.ts): fills the dock, compact chrome, the
     online list as a thin avatar bar - the panel is ~340px wide at most. */
  .chat-wrap--dock { height: auto; margin-top: 0; }
  .chat-wrap--dock .chat-hd { padding: 8px 8px 8px 12px; border-bottom: 1px solid var(--border-color); gap: 8px; }
  .chat-wrap--dock .chat-hd > div:first-child { flex: 1; }
  .chat-wrap--dock .chat-rooms { margin-right: 0; }
  .chat-wrap--dock .chat-room-tab { cursor: pointer; font-family: inherit; }
  .chat-dock-x, .chat-dock-m {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; border: none; background: none;
    color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .chat-dock-x:hover, .chat-dock-m:hover { background: var(--bg-color); color: var(--text-main); }
  .chat-dock-m { display: none; }
  /* The dock never clips the / and @ suggestion popup (matters in the short
     phone mini window, where it rises above the strip). */
  .chat-wrap--dock .chat-ui { overflow: visible; }
  @media (max-width: 768px) {
    .chat-wrap--dock .chat-dock-x { display: none; }
    .chat-wrap--dock .chat-dock-m { display: flex; width: 40px; height: 40px; }
    .chat-dock-cycle .chat-cycle-close,
    body.chat-dock-full .chat-dock-cycle .chat-cycle-grow { display: none; }
    body.chat-dock-full .chat-dock-cycle .chat-cycle-close { display: block; }
  }
  /* The window is short: keep the / and @ suggestions inside it. */
  .chat-wrap--dock #chat-hints { max-height: 240px; overflow-y: auto; }
  .chat-wrap--dock .chat-ui { border: none; border-radius: 0; flex-direction: column; }
  .chat-wrap--dock .chat-users {
    order: -1; width: 100%; height: 40px; min-height: 40px; box-sizing: border-box;
    border-left: none; border-bottom: 1px solid var(--border-color);
    overflow-x: auto; overflow-y: hidden; padding: 0 10px;
    display: flex; align-items: center; background: var(--bg-color);
  }
  .chat-wrap--dock #chat-participants { display: flex; align-items: center; width: 100%; }
  .chat-wrap--dock #chat-participants ul { display: flex; flex-direction: row; gap: 6px; list-style: none; padding: 0; margin: 0; align-items: center; }
  .chat-wrap--dock .chat-users-label { display: none; }
  .chat-wrap--dock .chat-user-item { margin-bottom: 0; gap: 0; }
  .chat-wrap--dock .chat-user-nm { display: none; }
  .chat-wrap--dock .chat-user-av { width: 28px; height: 28px; font-size: 10px; }
  .chat-wrap--dock #chat-messages { padding: 8px; gap: 4px; }
  .chat-wrap--dock .chat-message { max-width: 95%; }
  .chat-wrap--dock .chat-input-row { padding: 6px 10px; border-radius: 0; }

  @media (max-width: 768px) {
    /* LOCK VIEWPORT: Force fixed position between navs (the /chat page only -
       the dock positions itself, and must never lock every page's scroll). */
    .chat-wrap:not(.chat-wrap--dock) {
      position: fixed;
      top: 64px;
      bottom: calc(62px + env(safe-area-inset-bottom));
      left: 0; right: 0;
      height: auto;
      margin: 0;
      z-index: 50;
      background: var(--bg-color);
    }
    .chat-hd { 
      padding: 6px 12px; 
      border-bottom: 1px solid var(--border-color);
      background: var(--card-bg);
    }
    .chat-ui { border-radius: 0; border: none; flex-direction: column; }
    
    /* Participants as a thin scrollable bar */
    .chat-users {
      order: -1;
      width: 100%; height: 40px; min-height: 40px;
      border-left: none; border-bottom: 1px solid var(--border-color);
      overflow-x: auto; overflow-y: hidden;
      padding: 0 10px;
      display: flex; align-items: center;
      background: var(--bg-color);
    }
    #chat-participants { display: flex; align-items: center; width: 100%; }
    #chat-participants ul { display: flex; flex-direction: row; gap: 6px; list-style: none; padding: 0; margin: 0; align-items: center; }
    .chat-users-label { display: none; }
    .chat-user-item { margin-bottom: 0; gap: 0; }
    .chat-user-nm { display: none; }
    .chat-user-av { width: 28px; height: 28px; font-size: 10px; }
    
    #chat-messages { padding: 8px; gap: 4px; }
    .chat-message { max-width: 95%; }
    .chat-input-row { padding: 6px 10px; }

    /* Name menu becomes a bottom sheet */
    #chat-nick-scrim:not([hidden]) { display: block; position: fixed; inset: 0; z-index: 1199; background: rgba(0,0,0,0.4); }
    #chat-nick-menu {
      left: 0 !important; right: 0; top: auto !important; bottom: 0;
      width: 100%; max-height: 85vh; border-radius: 18px 18px 0 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .cnm-item { min-height: 48px; font-size: 15px; }
    .cnm-kb { display: none; }

    /* Disable layout margins and body scroll when chat is active */
    body:has(.chat-wrap:not(.chat-wrap--dock)) { overflow: hidden; position: fixed; width: 100%; }
    body:has(.chat-wrap:not(.chat-wrap--dock)) .layout { margin: 0 !important; padding: 0 !important; }
    body:has(.chat-wrap:not(.chat-wrap--dock)) .main { padding: 0 !important; }
  }

  /* Standalone (PWA) adjustments */
  @media (display-mode: standalone) and (max-width: 768px) {
    .chat-wrap:not(.chat-wrap--dock) {
      top: calc(64px + env(safe-area-inset-top)); 
    }
  }
</style>

<div class="chat-wrap${dock ? ' chat-wrap--dock' : ''}">
  <div class="chat-hd">
    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
      ${roomTabs}
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      ${isMod ? `<button type="button" id="chat-cleanup-btn" class="action-btn" style="padding:4px 8px; font-size:11px;" onclick="document.body.classList.toggle('cleanup-mode')"><span class="cleanup-off">Cleanup</span><span class="cleanup-on">Exit</span></button>` : ''}
      ${dockClose}
    </div>
  </div>

  <div class="chat-ui">
    <div class="chat-main">
      <div id="chat-root" data-me="${esc(user ? (user.display_name || user.email?.split('@')[0] || '') : '')}" data-ismod="${user && ['mod', 'admin'].includes(user.access_level) ? '1' : '0'}" data-room="${esc(activeSlug)}" data-dock="${dock ? '1' : '0'}" data-csrf="${csrfToken}" data-bot-name="${esc(botName || '')}" style="display:none"></div>
      <div id="chat-messages">
        <div id="chat-loading-placeholder" style="padding:20px;color:var(--text-muted);font-size:13px;text-align:center;"><!--extb-ui-->Connecting…<!--/extb-ui--></div>
      </div>

      <div id="chat-typing" aria-live="polite"></div>
      <form class="chat-input-row">
        ${csrfField({ csrfToken })}
        ${guestIndicator}
        <div id="chat-reply-bar">
          <span class="chat-reply-bar-txt"><!--extb-ui-->Replying to <!--/extb-ui--><strong id="chat-reply-bar-author"></strong></span>
          <button type="button" id="chat-reply-cancel" title="Cancel reply" data-extb-i18n-title="Cancel reply" aria-label="Cancel reply" data-extb-i18n-aria-label="Cancel reply">✕</button>
        </div>
        <div id="chat-hints" role="listbox" aria-label="Suggestions" hidden></div>
        <div class="chat-input-inner">
          <input type="text" id="chat-input" name="content" required maxlength="500" placeholder="Type a message, or / for commands" data-extb-i18n-placeholder="Type a message, or / for commands" autocomplete="off" aria-autocomplete="list" aria-controls="chat-hints">
          <button type="submit" id="chat-send" class="chat-send-btn" title="Send" data-extb-i18n-title="Send">
            <svg id="chat-send-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
            </svg>          </button>
        </div>
        <div id="chat-error"></div>
      </form>
    </div>

    <div id="chat-nick-scrim" hidden></div>
    <div id="chat-nick-menu" role="menu" aria-label="Member options" hidden></div>
    <aside class="chat-users">
      <div id="chat-participants">
        <p class="chat-users-label"><!--extb-ui-->Online<!--/extb-ui--></p>
        <ul style="list-style:none;padding:0;margin:0;">
          ${botName ? chatBotItem(esc(botName)) : ''}
        </ul>
      </div>
    </aside>
  </div>
</div>

<script>${CHAT_SCRIPT_BOOT}
</script>

<script>${chatMainScript(CHAT_BUILDERS_SRC)}
</script>
`;
}

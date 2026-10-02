import type { User, Room } from '../types';
import { canRead } from '../access';
import { renderChat } from './chat';

// The always-open chat dock. Rendered ONCE per full page load by renderLayout,
// as a sibling of <main class="main">, so htmx navigation (which only swaps
// .main) never touches it and the chat socket survives page changes.
//
// Three modes, one element (docs/LAYOUT.md):
//   >= 1200px  docked third grid column, open by default (remembered)
//   769-1199px overlay panel from the right, closed by default
//   <= 768px   floating chat window over the forum, opened from a round chat
//              button above the + post button; size button cycles
//              default -> large -> closed; the tab bar never moves
//
// While the dock exists, /chat never renders a second chat into .main
// (getChat serves a placeholder and opens the dock), so the chat element ids
// stay unique and there is only ever one socket per tab.

/** Chat rooms the dock offers this user, or [] when the user gets no dock. */
export function chatDockRooms(user: User | null, rooms: Room[]): Room[] {
  if (!user || user.is_approved !== 1 || user.is_banned) return [];
  return rooms.filter(r => r.kind === 'chat' && canRead(user, r));
}

// Runs as the FIRST thing in <body>, before anything paints, so the docked
// column doesn't pop in after load. Only the docked (wide) mode restores open
// state; overlay/drawer modes always start closed.
export const CHAT_DOCK_BOOT = `
(function () {
  try {
    document.body.classList.add('has-chat-dock');
    // Saved width (drag divider) before first paint - no width jump on load.
    var pct = parseFloat(localStorage.getItem('chat_dock_pct') || '');
    if (pct >= 15 && pct <= 75) document.documentElement.style.setProperty('--chat-dock-pct', pct + 'vw');
    var wide = window.matchMedia('not all and (max-width: 1199px)').matches;
    var phone = window.matchMedia('(max-width: 768px)').matches;
    if (wide && localStorage.getItem('chat_dock') !== '0') document.body.classList.add('chat-dock-open');
    // Phone: the floating chat window starts closed (chat button showing) and
    // comes back in the size you left it.
    var m = localStorage.getItem('chat_dock_m');
    if (phone && (m === 'default' || m === 'large')) document.body.classList.add('chat-dock-open');
    if (phone && m === 'large') document.body.classList.add('chat-dock-full');
  } catch (e) {}
})();`;

const CHAT_DOCK_CSS = `
  .chat-dock { display: none; min-width: 0; background: var(--card-bg); flex-direction: column; }
  body.chat-dock-open .chat-dock { display: flex; }
  .chat-dock .chat-wrap--dock { flex: 1; min-height: 0; }

  /* Docked column */
  @media not all and (max-width: 1199px) {
    body.chat-dock-open .layout,
    body.chat-dock-open.sidebar-collapsed .layout { grid-template-columns: 60px minmax(0, 1fr) var(--chat-dock-w); }
    body.chat-dock-open:not(.sidebar-collapsed) .layout { grid-template-columns: 240px minmax(0, 1fr) var(--chat-dock-w); }
    .chat-dock {
      position: sticky; top: 64px; height: calc(100vh - 64px);
      border-left: 1px solid var(--border-color);
    }
    body.chat-dock-open .fab { right: calc(var(--chat-dock-w) + 32px); }
  }

  /* Overlay panel (tablet / small laptop) */
  @media (max-width: 1199px) {
    .chat-dock {
      position: fixed; top: 64px; right: 0; bottom: 0; z-index: 1000;
      width: clamp(280px, var(--chat-dock-pct), calc(100vw - 60px));
      border-left: 1px solid var(--border-color);
      box-shadow: -12px 0 32px rgba(0, 0, 0, 0.18);
    }
    body.chat-dock-open .fab { display: none; }
  }

  /* Phone: chat is a floating window over the forum, anchored bottom-right
     above the tab bar (which never moves), opened from the round chat button
     stacked above the + post button. Default size, or large
     (body.chat-dock-full); the window's size button goes default -> large ->
     closed. */
  @media (max-width: 768px) {
    .chat-dock {
      top: auto; left: 12px; right: 12px; width: auto; z-index: 101;
      bottom: calc(62px + env(safe-area-inset-bottom) + 12px);
      height: min(var(--chat-win-h), calc(100vh - 160px));
      height: min(var(--chat-win-h), calc(100dvh - 160px));
      border: 1px solid var(--border-color); border-radius: 18px; overflow: hidden;
      box-shadow: 0 18px 48px -12px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.08);
      transform-origin: bottom right;
    }
    body.chat-dock-open .chat-dock { animation: chat-win-in 0.18s ease-out; }
    body.chat-dock-full .chat-dock {
      height: calc(100vh - 64px - 62px - 24px - env(safe-area-inset-bottom));
      height: calc(100dvh - 64px - 62px - 24px - env(safe-area-inset-bottom));
    }
    /* Default size keeps to the conversation; the online bar is in large. */
    body:not(.chat-dock-full) .chat-wrap--dock .chat-users { display: none; }
  }
  @keyframes chat-win-in {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  @media (display-mode: standalone) and (max-width: 1199px) {
    .chat-dock { top: calc(64px + env(safe-area-inset-top)); }
  }
  @media (display-mode: standalone) and (max-width: 768px) {
    .chat-dock { top: auto; }
  }

  /* Phone chat button: round, stacked above the + post button (or in its
     place on pages without one). Hidden while the window is open. */
  .chat-fab { display: none; }
  @media (max-width: 768px) {
    body.has-chat-dock:not(.chat-dock-open) .chat-fab {
      display: flex; align-items: center; justify-content: center;
      position: fixed; right: 16px; z-index: 99;
      bottom: calc(70px + 52px + 12px + env(safe-area-inset-bottom));
      width: 52px; height: 52px; border-radius: 50%; padding: 0;
      background: var(--card-bg); color: var(--primary);
      border: 1px solid var(--border-color); cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    body.has-chat-dock.fab-hidden:not(.chat-dock-open) .chat-fab,
    body.has-chat-dock:not(:has(.fab)):not(.chat-dock-open) .chat-fab {
      bottom: calc(70px + env(safe-area-inset-bottom));
    }
    .chat-fab .js-chat-badge:empty { display: none; }
    .chat-fab .js-chat-badge {
      position: absolute; top: -2px; right: -2px;
      min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px;
      background: var(--danger); color: #fff; font-size: 10px; font-weight: 800; line-height: 18px; text-align: center;
      border: 2px solid var(--card-bg);
    }
  }

  /* Drag divider on the dock's left edge (docked + overlay; not on phones).
     The dock is sticky/fixed in every mode, so it already anchors this. */
  .chat-dock-resize {
    position: absolute; top: 0; bottom: 0; left: -4px; width: 8px; z-index: 5;
    cursor: col-resize; touch-action: none; background: transparent;
  }
  .chat-dock-resize::after {
    content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px;
    background: transparent; transition: background 0.15s;
  }
  .chat-dock-resize:hover::after, .chat-dock-resize:focus-visible::after,
  body.chat-dock-resizing .chat-dock-resize::after { background: var(--primary); }
  .chat-dock-resize:focus-visible { outline: none; }
  body.chat-dock-resizing, body.chat-dock-resizing * { cursor: col-resize !important; user-select: none !important; }
  @media (max-width: 768px) { .chat-dock-resize { display: none; } }

  /* Right-edge tab: brings a hidden dock back (desktop/tablet; phones use the
     bottom-nav Chat tab). */
  .chat-dock-tab { display: none; }
  @media not all and (max-width: 768px) {
    body.has-chat-dock:not(.chat-dock-open) .chat-dock-tab {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 1000;
      padding: 14px 8px; border: 1px solid var(--border-color); border-right: none;
      border-radius: 10px 0 0 10px; background: var(--card-bg); color: var(--text-main);
      box-shadow: -4px 0 14px rgba(0, 0, 0, 0.1); cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 700;
    }
    .chat-dock-tab:hover { color: var(--primary); }
    .chat-dock-tab-label { writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.04em; }
    .chat-dock-tab .js-chat-badge:empty { display: none; }
    .chat-dock-tab .js-chat-badge {
      min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px;
      background: var(--danger); color: #fff; font-size: 10px; line-height: 16px; text-align: center;
    }
  }

  .chat-dock-placeholder { max-width: 520px; margin: 40px auto; text-align: center; color: var(--text-muted); }
  .chat-dock-placeholder h1 { font-size: 20px; color: var(--text-main); margin: 0 0 8px; }
`;

// Dock controller: open/close, modes, history (Back closes the drawer), the
// /chat link intercept, keyboard-safe viewport fit. The chat client itself
// (chatMainScript) runs inside the dock markup and starts its socket lazily
// via window.__chatDockStart the first time the dock is shown.
export const CHAT_DOCK_SCRIPT = `
(function () {
  var dock = document.getElementById('chat-dock');
  if (!dock) return;
  var body = document.body;
  var wideMq = window.matchMedia('not all and (max-width: 1199px)');
  var phoneMq = window.matchMedia('(max-width: 768px)');
  var pushed = false;

  function isOpen() { return body.classList.contains('chat-dock-open'); }
  function savePref(v) { try { localStorage.setItem('chat_dock', v); } catch (e) {} }
  function markRead() {
    document.cookie = 'chat_last_view=' + new Date().toISOString() + ';path=/;max-age=31536000;samesite=lax';
    document.querySelectorAll('.js-chat-badge').forEach(function (b) { b.innerHTML = ''; });
  }
  function start() { if (window.__chatDockStart) window.__chatDockStart(); }

  function isPhone() { return phoneMq.matches; }
  function isFull() { return body.classList.contains('chat-dock-full'); }
  function savePhonePref(v) { try { localStorage.setItem('chat_dock_m', v); } catch (e) {} }
  function pushEntry() {
    if (pushed) return;
    try { history.pushState({ chatDock: 1 }, ''); pushed = true; } catch (e) {}
  }
  function popEntry() {
    if (!pushed) return;
    pushed = false;
    try { history.back(); } catch (e) {}
  }
  function scrollChatToEnd() {
    var b = document.getElementById('chat-messages');
    if (b) b.scrollTop = b.scrollHeight;
  }
  function shown() { start(); markRead(); fit(); scrollChatToEnd(); }

  // Phone floating window: closed -> default -> large -> closed. Back closes
  // it from either size.
  var cycleBtn = dock.querySelector('[data-chat-dock-cycle]');
  function syncCycle() {
    if (!cycleBtn) return;
    var big = isFull();
    cycleBtn.setAttribute('aria-label', big ? 'Close chat' : 'Make chat larger');
    cycleBtn.setAttribute('title', big ? 'Close' : 'Larger');
  }
  function phoneDefault() {
    body.classList.add('chat-dock-open');
    body.classList.remove('chat-dock-full');
    savePhonePref('default');
    pushEntry();
    syncCycle();
    shown();
  }
  function phoneLarge() {
    body.classList.add('chat-dock-open', 'chat-dock-full');
    savePhonePref('large');
    pushEntry();
    syncCycle();
    shown();
  }
  function phoneHideInternal() {
    body.classList.remove('chat-dock-open', 'chat-dock-full');
    dock.style.bottom = '';
    dock.style.maxHeight = '';
    savePhonePref('closed');
    syncCycle();
  }
  function phoneHide() {
    phoneHideInternal();
    popEntry();
  }
  function phoneCycle() {
    if (!isOpen()) phoneDefault();
    else if (!isFull()) phoneLarge();
    else phoneHide();
  }

  function open(room) {
    if (room && window.__chatDockRoom) window.__chatDockRoom(room);
    if (isPhone()) { if (!isOpen()) phoneDefault(); return; }
    if (!isOpen()) {
      body.classList.add('chat-dock-open');
      if (wideMq.matches) savePref('1');
      else pushEntry();
    }
    shown();
  }
  function closeInternal() {
    body.classList.remove('chat-dock-open', 'chat-dock-full');
    dock.style.bottom = '';
  }
  function close() {
    if (isPhone()) { phoneHide(); return; }
    if (!isOpen()) return;
    if (wideMq.matches) savePref('0');
    closeInternal();
    popEntry();
  }
  function toggle() {
    // Phone: the bottom-nav Chat tab steps through the same cycle as the
    // window's size button.
    if (isPhone()) { phoneCycle(); return; }
    if (isOpen()) close(); else open();
  }
  window.__chatDock = { open: open, close: close, toggle: toggle };

  // Back button closes the phone window / tablet overlay. Never leaves the
  // page while chat is covering it.
  window.addEventListener('popstate', function () {
    if (!pushed) return;
    pushed = false;
    if (isPhone()) phoneHideInternal();
    else closeInternal();
  });

  // Capture phase: runs before htmx's own click handler on the Chat links, so
  // /chat toggles the dock instead of navigating.
  document.addEventListener('click', function (e) {
    if (!e.target.closest || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest('a[href]');
    if (a && !dock.contains(a)) {
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.origin === location.origin && url.pathname === '/chat') {
        e.preventDefault();
        e.stopPropagation();
        var room = url.searchParams.get('room');
        if (room) open(room); else toggle();
        return;
      }
    }
    if (e.target.closest('[data-chat-dock-close]')) { e.preventDefault(); close(); return; }
    if (e.target.closest('[data-chat-dock-cycle]')) { e.preventDefault(); phoneCycle(); return; }
    if (e.target.closest('[data-chat-dock-open]')) { e.preventDefault(); open(); }
  }, true);

  // Following a link while chat is open. Tablet overlay closes so the page
  // shows; the phone window stays with you (large shrinks to default so the
  // new page is visible) - that is the point of always-open chat. The history
  // entry we pushed is retagged as an ordinary htmx entry for this URL
  // instead of popped: a history.back() here would race htmx's own pushState.
  body.addEventListener('htmx:beforeSwap', function (e) {
    var t = e.detail && e.detail.target;
    if (wideMq.matches || !t || !t.classList || !t.classList.contains('main') || !isOpen()) return;
    if (pushed) { pushed = false; try { history.replaceState({ htmx: true }, '', location.href); } catch (err) {} }
    if (isPhone()) {
      if (isFull()) { body.classList.remove('chat-dock-full'); savePhonePref('default'); syncCycle(); fit(); }
    } else closeInternal();
  });
  // /chat fetched over htmx (e.g. from a link we didn't intercept).
  body.addEventListener('chatDockOpen', function () { open(); });

  // Escape closes the overlay/drawer - unless a chat popup is using it.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen() || wideMq.matches) return;
    var menu = document.getElementById('chat-nick-menu');
    var hints = document.getElementById('chat-hints');
    if ((menu && !menu.hidden) || (hints && !hints.hidden)) return;
    close();
  }, true);

  // Phone keyboard: keep the input above it.
  function fit() {
    if (!isOpen() || !phoneMq.matches || !window.visualViewport) { dock.style.bottom = ''; dock.style.maxHeight = ''; return; }
    var vv = window.visualViewport;
    var kb = window.innerHeight - vv.height - vv.offsetTop;
    if (kb > 80) {
      // Sit just above the keyboard and never run under the topnav.
      dock.style.bottom = (kb + 8) + 'px';
      dock.style.maxHeight = Math.max(160, vv.height - 64 - 16) + 'px';
    } else {
      dock.style.bottom = '';
      dock.style.maxHeight = '';
    }
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  // Crossing into / out of docked width: overlay state never leaks into the
  // docked column and vice versa.
  function onModeChange() {
    body.classList.remove('chat-dock-full');
    if (wideMq.matches) {
      if (pushed) { pushed = false; }
      var pref = '1';
      try { pref = localStorage.getItem('chat_dock') || '1'; } catch (e) {}
      if (pref !== '0') { body.classList.add('chat-dock-open'); start(); }
      else body.classList.remove('chat-dock-open');
    } else if (isPhone()) {
      pushed = false;
      var m = 'closed';
      try { m = localStorage.getItem('chat_dock_m') || 'closed'; } catch (e) {}
      if (m === 'default' || m === 'large') {
        body.classList.add('chat-dock-open');
        if (m === 'large') body.classList.add('chat-dock-full');
        start();
      } else body.classList.remove('chat-dock-open');
      syncCycle();
    } else if (isOpen() && !pushed) {
      closeInternal();
    }
    fit();
  }
  if (wideMq.addEventListener) wideMq.addEventListener('change', onModeChange);
  if (phoneMq.addEventListener) phoneMq.addEventListener('change', onModeChange);

  // --- Drag divider: width as a share of the viewport (15-75%, default 25).
  // CSS clamp() on --chat-dock-w / the overlay width enforces the px limits.
  var handle = dock.querySelector('.chat-dock-resize');
  var root = document.documentElement;
  var DEFAULT_PCT = 25;
  function currentPct() {
    var v = parseFloat(root.style.getPropertyValue('--chat-dock-pct'));
    return v >= 15 && v <= 75 ? v : DEFAULT_PCT;
  }
  function setPct(p, save) {
    p = Math.max(15, Math.min(75, Math.round(p * 10) / 10));
    root.style.setProperty('--chat-dock-pct', p + 'vw');
    if (handle) handle.setAttribute('aria-valuenow', String(Math.round(p)));
    if (save) { try { localStorage.setItem('chat_dock_pct', String(p)); } catch (e) {} }
  }
  if (handle) {
    handle.setAttribute('aria-valuenow', String(Math.round(currentPct())));
    var dragging = false, raf = 0, lastX = 0;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      body.classList.add('chat-dock-resizing');
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      lastX = e.clientX;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        setPct((window.innerWidth - lastX) / window.innerWidth * 100, false);
      });
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      body.classList.remove('chat-dock-resizing');
      // Save the width actually shown: past the clamp the pointer keeps going
      // but the dock stops, and the saved value should match what you saw.
      var shown = dock.getBoundingClientRect().width;
      setPct(shown ? shown / window.innerWidth * 100 : currentPct(), true);
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('dblclick', function () { setPct(DEFAULT_PCT, true); });
    handle.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPct(currentPct() + 2, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPct(currentPct() - 2, true); }
      else if (e.key === 'Home') { e.preventDefault(); setPct(DEFAULT_PCT, true); }
    });
  }

  syncCycle();
  if (body.dataset.chatOpen !== undefined) {
    // /chat visited directly: on a phone that means "I want chat" - large.
    if (isPhone()) { if (body.dataset.chatOpen && window.__chatDockRoom) window.__chatDockRoom(body.dataset.chatOpen); phoneLarge(); }
    else open(body.dataset.chatOpen || undefined);
  }
  else if (isOpen()) shown();
})();`;

export function renderChatDock(p: {
  user: User;
  chatRooms: Room[];
  csrfToken?: string;
}): string {
  const activeSlug = p.chatRooms.some(r => r.slug === 'chat') ? 'chat' : p.chatRooms[0]!.slug;
  return `<aside id="chat-dock" class="chat-dock" aria-label="Chat">
<style>${CHAT_DOCK_CSS}</style>
<div class="chat-dock-resize" role="separator" aria-orientation="vertical" aria-label="Resize chat (arrow keys, double-click to reset)" tabindex="0" aria-valuemin="15" aria-valuemax="75" aria-valuenow="25"></div>
${renderChat({ user: p.user, csrfToken: p.csrfToken, rooms: p.chatRooms, activeSlug, dock: true })}
</aside>`;
}

/** Right-edge tab that brings a hidden dock back. The .js-chat-badge inside is
 *  filled by the heartbeat like the topnav/bottom-nav chat badges. */
export function renderChatDockTab(): string {
  return `<button type="button" class="chat-dock-tab" data-chat-dock-open aria-label="Show chat">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <span class="chat-dock-tab-label">Chat</span>
  <span class="js-chat-badge"></span>
</button>`;
}

/** Phone chat button, stacked above the + post button. Opens the floating
 *  chat window; carries the heartbeat .js-chat-badge unread count. */
export function renderChatFab(): string {
  return `<button type="button" class="chat-fab" data-chat-dock-open aria-label="Open chat">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <span class="js-chat-badge"></span>
</button>`;
}

/** What /chat shows in .main when the chat lives in the dock. */
export function renderChatDockPlaceholder(): string {
  return `<div class="chat-dock-placeholder">
  <h1>Chat is open in the panel</h1>
  <p>It stays open while you browse. Use the Chat button to show or hide it.</p>
  <button type="button" class="btn" data-chat-dock-open>Open chat</button>
</div>`;
}

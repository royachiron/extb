import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Feature manifest - regression tripwire.
 *
 * Each entry pins a shipped feature to sentinel strings in its source file.
 * LLM sessions have repeatedly deleted whole features while rewriting the
 * large template-literal views (poll builder deleted then restored in
 * 50d717b; composer layout broken again after). A missing sentinel here
 * means the feature was removed - fail loudly BEFORE deploy.
 *
 * Registry with context: docs/FEATURES.md. When intentionally removing a
 * feature, delete its entry here AND in docs/FEATURES.md in the same commit.
 *
 * SENTINELS MUST BE SELF-TERMINATING. These are substring checks, so a
 * sentinel that is a prefix of a valid mutation cannot fail:
 *   'renderReactions'         is satisfied by renderReactionsX  -> use 'renderReactions('
 *   'class="flash"'           is satisfied by class="flash flash-warn"
 *                                                              -> use 'class="flash">'
 * Quote-terminated markup sentinels ('class="avatar"') get this for free;
 * bare identifiers do not. After adding an entry, mutate the guarded code and
 * confirm the test goes red by feature name. A sentinel that cannot fail is
 * not a guard - that is exactly how '.bottom-nav' sat green for months.
 */

const root = join(__dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

interface Feature {
  name: string;
  file: string;
  sentinels: string[];
}

const manifest: Feature[] = [
  {
    name: 'DM inbox: cursor paging (load older conversations)',
    file: 'src/views/dms.ts',
    sentinels: ["id: 'inbox-more',", '`/api/dms/page?before=${nextBeforeId}`', 'hx-swap-oob="beforeend:#inbox-items"', '<div id="inbox-items">'],
  },
  {
    name: 'DM thread: cursor paging (load older messages)',
    file: 'src/views/dms.ts',
    sentinels: ["id: 'dm-older',", '/older?before=${nextBeforeId}`', 'hx-swap-oob="afterbegin:#dm-items"', '<div id="dm-items">'],
  },
  {
    name: 'DM thread: bubble width is token-driven and ultrawide-bounded',
    file: 'src/views/dms.ts',
    // A bare percentage is a percentage of an UNCAPPED .main, so it balloons
    // on wide monitors (60% was 1450px at 2560px wide). The min() ceiling is
    // the whole point - do not simplify it back to a single value.
    sentinels: ['max-width: min(var(--measure-chat), var(--measure-chat-max));'],
  },
  {
    name: 'sizing tokens exist in :root',
    file: 'src/views/layout.ts',
    sentinels: ['--measure-chat:', '--measure-chat-max:'],
  },
  {
    name: 'DM breakpoints leave no fractional dead zone',
    file: 'src/views/dms.ts',
    // Exact complement of the mobile `max-width: 768px` query, so no viewport
    // can match neither. The old `min-width: 769px` skipped 768.5px entirely
    // (browser zoom / HiDPI); `min-width: 768.02px` only shrinks that gap
    // rather than closing it. `not all and` is gapless by construction.
    //
    // LIMIT: substring check, and dms.ts has TWO of these queries - reverting
    // only one leaves this green. Verified red only when both are removed.
    // The viewport sweep in the width harness is what actually covers that.
    sentinels: ['@media not all and (max-width: 768px)'],
  },
  {
    name: 'DM thread: #dm-items wrapper creates no layout box',
    file: 'src/views/dms.ts',
    // .dm-msg alignment uses align-self, which only applies to a direct flex
    // item of .dm-thread. Drop this rule and "mine" bubbles stop reaching the
    // right edge and pile up mid-page. Shipped broken once - 2026-07-29.
    sentinels: ['#dm-items { display: contents; }'],
  },
  {
    name: 'DM thread: poll cursor reads the message list, not the scroller',
    file: 'src/views/dms.ts',
    // The load-older control lives inside #dm-thread; if this selector drifts
    // back to #dm-thread the poll cursor can latch onto the wrong element.
    sentinels: ['#dm-items .dm-msg:last-child'],
  },
  {
    name: 'compose form: title + body inputs',
    file: 'src/views/post.ts',
    sentinels: ['class="post-title-in"', 'class="post-text-in"'],
  },
  {
    name: 'compose form: poll builder (collapsible)',
    file: 'src/views/post.ts',
    sentinels: ['<details class="poll-builder"', 'name="poll_question"', 'name="poll_options"', 'name="poll_multi"', 'name="poll_ends_at"'],
  },
  {
    name: 'compose form: markdown toolbar + CW tag picker',
    file: 'src/views/post.ts',
    sentinels: ["markdownToolbar('topic-content'", 'tagPicker(allCwTags'],
  },
  {
    name: 'compose form: intro auto-delete checkbox',
    file: 'src/views/post.ts',
    sentinels: ['name="delete_on_approve"'],
  },
  {
    name: 'CW tag picker widget',
    file: 'src/views/tags.ts',
    sentinels: ['class="cw-picker"', 'name="cw_tag_ids"'],
  },
  {
    name: 'threaded replies: collapse toggle',
    file: 'src/views/post.ts',
    sentinels: ['thread-collapse-btn', 'data-thread-toggle'],
  },
  {
    name: 'threaded replies: collapse CSS + JS',
    file: 'src/views/layout.ts',
    sentinels: ['.thread-collapse-btn', 'thread-collapsed', 'thread-hidden'],
  },
  {
    name: 'collapsible desktop sidebar (CSS)',
    file: 'src/views/layout.ts',
    sentinels: ['sidebar-collapsed'],
  },
  {
    // JS half lives in the extracted script slice, not layout.ts.
    name: 'collapsible desktop sidebar (JS toggle)',
    file: 'src/views/layout-scripts/ui.ts',
    sentinels: ['sidebarCollapsed'],
  },
  {
    // Compose used to be a fixed/inset/z-index fullscreen takeover that hid
    // topnav/sidebar via body.post-open (see git history pre-2026-08-10).
    // Deliberately removed: compose is now a normal .main page like any
    // other, so topnav/sidebar stay visible and clickable while writing.
    // The structural classes below are kept as plain in-flow card markup.
    name: 'compose form chrome (normal-page composer, not a modal)',
    file: 'src/views/layout.ts',
    sentinels: ['.post-wrap', '.post-body-wrap', '.post-ft'],
  },
  {
    name: 'mobile bottom nav + FAB',
    file: 'src/views/layout.ts',
    sentinels: ['.bottom-nav', '.fab'],
  },
  {
    name: 'dark mode toggle (CSS)',
    file: 'src/views/layout.ts',
    sentinels: ['body.dark-mode'],
  },
  {
    // JS half lives in the extracted script slice, not layout.ts.
    name: 'dark mode toggle (JS handler)',
    file: 'src/views/layout-scripts/ui.ts',
    sentinels: ['dark-mode-toggle'],
  },
  {
    name: 'markdown toolbar helper',
    file: 'src/views/layout-utils.ts',
    sentinels: ['function markdownToolbar(', 'class="md-toolbar"'],
  },
  {
    // Shared by renderLoadMorePosts (topic.ts) and renderNotificationsMore
    // (notifications.ts). renderFeedMore keeps its own copy - it carries an
    // extra hx-on::after-request attribute.
    name: 'load-more button helper (topic replies + notifications)',
    file: 'src/views/layout-utils.ts',
    sentinels: [
      // Trailing '(' is load-bearing: sentinels are substring checks, so a
      // bare 'export function loadMoreButton' is still satisfied by a rename
      // to loadMoreButtonX. Quote-terminated sentinels get this for free;
      // identifiers do not.
      'export function loadMoreButton(',
      'class="btn btn-secondary"',
      'hx-swap="outerHTML"',
    ],
  },
  {
    // Extracted from layout.ts. The layout.ts entries above guard the CSS and
    // JS halves of the shell; these guard the MARKUP, which nothing covered
    // before - '.bottom-nav'/'.fab'/'sidebar-collapsed' only ever matched CSS
    // selectors, so the shell HTML could be deleted with the suite still green.
    name: 'layout shell: topnav + brand + primary nav',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'class="topnav"',
      'id="drawer-toggle"',
      'id="dark-mode-toggle"',
      'id="font-size-toggle"',
      'class="brand"',
      'aria-label="Primary"',
      'id="dm-nav-btn"',
    ],
  },
  {
    name: 'layout shell: sidebar (rooms, private rooms, community links)',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'class="sidebar"',
      'id="sidebar-drawer"',
      'id="drawer-close"',
      'class="room-icon"',
      'class="room-label"',
      'class="unread-dot"',
      'class="lock"',
      '/about',
      '/tos',
    ],
  },
  {
    // First real coverage of the bottom-nav MARKUP. The '.bottom-nav' sentinel
    // on layout.ts is a CSS selector string and only ever matched the style
    // block, so this nav could have been deleted with the suite still green.
    name: 'layout shell: bottom nav (mobile tab bar)',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'class="bottom-nav"',
      'class="bn-item"',
      'class="bn-badge js-chat-badge"',
      'class="bn-badge js-dm-badge"',
      'data-path="/chat"',
      'data-path="/dms"',
    ],
  },
  {
    // Needs You replaced the Forum tab in both navs. /forum itself stays live
    // and keeps its room directory - only the nav slot moved.
    name: 'Needs You: nav slot (desktop + mobile)',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'data-path="/needs-you"',
      '>Needs you</a>',
    ],
  },
  {
    // The unanswered-thread queue itself. Prod baseline when this shipped:
    // 12 of 25 topics in a fortnight had no reply at all.
    name: 'Needs You: unanswered queue view + empty state',
    file: 'src/views/feed.ts',
    sentinels: [
      'export function renderNeedsYou(',
      'class="ny-list"',
      'class="ny-item"',
      'Nothing waiting',
      'ny-age--urgent',
    ],
  },
  {
    // Killing the Forum tab orphaned three sidebar panels; they were moved into
    // a shared helper so both /forum and /needs-you keep rendering them.
    name: 'Forum index side panels (shared by /forum and /needs-you)',
    file: 'src/views/feed.ts',
    sentinels: [
      'export function renderIndexPanels(',
      '>Top Topics<',
      '>Latest Replies ',
      '>Top Contributors ',
    ],
  },
  {
    // Same blind spot as bottom-nav: '.fab' only ever matched CSS.
    name: 'layout shell: new-topic FAB',
    file: 'src/views/layout-shell.ts',
    sentinels: ['class="fab"', 'aria-label="New topic"'],
  },
  {
    // 'class="avatar"' also guards against an accidental avatarHtml()
    // substitution - that helper emits a <span>, so the sentinel goes red.
    name: 'layout shell: user menu (notifications, avatar, account dropdown)',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'class="user-menu notification-menu"',
      'id="notification-inbox"',
      'id="notification-badge-container"',
      'class="avatar"',
      'class="dropdown-inner"',
      'action="/logout"',
      'href="/register"',
    ],
  },
  {
    // Part of the iron-gate flow: unverified users reach the forum but get
    // only this banner plus its resend form. Losing it strands them with no
    // path to re-request the email.
    name: 'layout shell: email verify banner + resend form',
    file: 'src/views/layout-shell.ts',
    sentinels: [
      'class="flash flash-warn"',
      'action="/resend-verification"',
      'Resend verification email',
    ],
  },
  {
    // Sentinel is 'class="flash">' WITH the closing angle bracket on purpose.
    // A bare 'class="flash"' is also satisfied by the verify banner's
    // 'class="flash flash-warn"', so it would stay green with the plain flash
    // deleted - the same false-guard shape as the old '.bottom-nav' entry.
    name: 'layout shell: flash message strip',
    file: 'src/views/layout-shell.ts',
    sentinels: ['class="flash">'],
  },
  {
    name: 'post reactions',
    file: 'src/views/post.ts',
    sentinels: ['renderReactions(', 'reaction-picker'],
  },
  {
    name: 'shared video embed (YouTube + unsupported-host notice)',
    file: 'src/lib/video-embeds.ts',
    sentinels: ['export function transformVideoEmbeds(', 'youtube.com/embed/', 'video-embed-notice'],
  },
  {
    // Your own message shows the instant you hit Enter; the DO echo confirms
    // it. Sends queue behind the DO cooldown instead of bouncing.
    name: 'chat: optimistic send (instant bubble, cooldown queue, retry)',
    file: 'src/views/chat-scripts.ts',
    sentinels: ['function showPending(', 'function pumpQueue(', 'data-retry='],
  },
  {
    name: 'chat: name menu (whois card + actions)',
    file: 'src/views/chat-user-menu.ts',
    sentinels: ['export function renderChatUserMenu(', 'data-nick-act="mention"', 'data-nick-act="block"', 'data-nick-act="purge"'],
  },
  {
    // Chat lives in the page shell next to .main so htmx navigation never
    // kills the socket. Losing the shell mount = chat back to a separate page.
    name: 'chat dock: rendered in the shell outside .main',
    file: 'src/views/layout.ts',
    sentinels: ['renderChatDock({', '--chat-dock-w:', '<script>${CHAT_DOCK_BOOT}</script>', '<script>${CHAT_DOCK_SCRIPT}</script>'],
  },
  {
    name: 'chat dock: modes, /chat intercept, Back closes drawer',
    file: 'src/views/chat-dock.ts',
    sentinels: ['export function chatDockRooms(', '<aside id="chat-dock"', "url.pathname === '/chat'", "history.pushState({ chatDock: 1 }", '@media not all and (max-width: 1199px)'],
  },
  {
    name: 'chat dock: drag divider + right-edge tab + width tokens',
    file: 'src/views/chat-dock.ts',
    sentinels: ['class="chat-dock-resize"', 'class="chat-dock-tab"', "localStorage.setItem('chat_dock_pct'", 'export function renderChatDockTab('],
  },
  {
    // Phones: chat floats over the forum (opened from the chat button above
    // the + button) instead of being a separate screen.
    name: 'chat dock: phone floating window + chat button + size cycle',
    file: 'src/views/chat-dock.ts',
    sentinels: ['function phoneCycle(', 'function phoneDefault(', 'function phoneLarge(', 'export function renderChatFab(', 'class="chat-fab"', "@keyframes chat-win-in"],
  },
  {
    name: 'chat dock: user-sized width token',
    file: 'src/views/layout.ts',
    sentinels: ['--chat-dock-pct: 25vw;', 'var(--chat-dock-pct)', 'renderChatDockTab()'],
  },
  {
    name: 'chat dock: lazy start + in-place room switch',
    file: 'src/views/chat-scripts.ts',
    sentinels: ['window.__chatDockStart = function', 'function switchRoom(', 'if (gen !== connGen) return;'],
  },
  {
    name: 'chat: name menu wiring + / and @ hints',
    file: 'src/views/chat-scripts.ts',
    sentinels: ['function openMenu(', "'/chat/user/'", 'function runLocalCommand(', 'function updateHints('],
  },
];

describe('feature manifest', () => {
  for (const f of manifest) {
    it(f.name, () => {
      const code = src(f.file);
      for (const s of f.sentinels) {
        expect(code, `${f.file} lost sentinel "${s}" - feature "${f.name}" regressed?`).toContain(s);
      }
    });
  }

  it('compose form: poll builder lives inside post-body-wrap, before post-ft', async () => {
    // 2026-08-10: renderNewTopicComposer and renderRoomTopicComposer both
    // moved to a shared renderComposerFields() helper (task A: composer is a
    // normal .main page now, not a fixed/inset/z-index modal - see the
    // "compose form chrome" entry above). The poll-builder literal HTML and
    // the post-body-wrap/post-ft literal HTML now live in two different
    // source-level constants, so a raw source-text slice can't establish
    // their rendered order any more - render for real and check the output.
    const { renderNewTopicComposer, renderRoomTopicComposer } = await import('../src/views/post');
    const room = { id: 1, name: 'Coping', slug: 'coping' } as any;

    for (const html of [
      renderNewTopicComposer({ csrfToken: 't', preselected: room, postRooms: [room], prefillTitle: '', prefillBody: '', showAutoDelete: false, allCwTags: [] }),
      renderRoomTopicComposer({ csrfToken: 't', room, showAutoDelete: false, allCwTags: [] }),
    ]) {
      const bodyWrap = html.indexOf('class="post-body-wrap"');
      const poll = html.indexOf('<details class="poll-builder"');
      // Not indexOf('</details>') from 0 - tagPicker() renders its own
      // <details> (the CW picker), which closes earlier in the output.
      const pollClose = html.indexOf('</details>', poll);
      const footer = html.indexOf('class="post-ft"');

      expect(bodyWrap, 'post-body-wrap missing from compose form').toBeGreaterThan(-1);
      expect(poll, 'poll builder must be a collapsed <details> block').toBeGreaterThan(bodyWrap);
      expect(pollClose).toBeGreaterThan(poll);
      expect(footer, 'post-ft footer missing from compose form').toBeGreaterThan(pollClose);
    }
  });
});

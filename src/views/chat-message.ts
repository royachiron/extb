// Single source of truth for the chat-message bubble markup.
//
// Before this module the bubble shell (.chat-message → header → quote → body →
// reactions), the action buttons, and the reaction pill were hand-coded TWICE:
// server-side in src/api/chat.ts (the poll-fallback render) and client-side in
// src/views/chat.ts `appendMsg` (the live WebSocket render). One visual tweak
// meant two edits or silent divergence. These builders own the shell once.
//
// They are PURE and CLOSURE-FREE: every builder takes already-escaped/already-
// built HTML fragments and only concatenates strings - no `esc`, no env, no
// outer bindings. That is what lets the SAME source run in two runtimes: the
// Worker imports them directly, and the browser gets their source injected into
// the inline <script> via Function.prototype.toString() (no client bundler).
//
// They are written as `const X = (p) => ...` arrow assignments on purpose: when
// embedded as `const X = ${X.toString()};` the browser binding name is supplied
// by us, so it survives esbuild renaming/minification of the bundled worker.
//
// Per-path data-shaping (esc, locale time, the mod delete button which differs
// between HTMX `hx-post` server-side and `data-del` WS client-side) stays at the
// call sites; only the markup shell is unified - exactly the part that bit us.

// The whole bubble. `headerHtml`/`quoteHtml`/`bodyHtml`/`reactionsHtml` are the
// already-built inner fragments. `reactionsHtml` is the pills only - the
// `.chat-reactions` wrapper lives here so it is emitted identically both paths.
export const chatBubble = (p: {
  id: number | string;
  isMe: boolean;
  headerHtml: string;
  quoteHtml: string;
  bodyHtml: string;
  reactionsHtml: string;
}): string =>
  '<div class="chat-message' + (p.isMe ? ' is-me' : '') + '" id="chat-msg-' + p.id +
  '" data-id="' + p.id + '" style="position:relative;">' +
  '<div class="chat-msg-hd">' + p.headerHtml + '</div>' +
  p.quoteHtml +
  '<div class="chat-msg-body">' + p.bodyHtml + '</div>' +
  '<div class="chat-reactions" data-react-row="' + p.id + '">' + p.reactionsHtml + '</div>' +
  '</div>';

// The header row: author, time, then the action buttons in order add, reply,
// delete. `authorHtml`/`timeHtml`/`utc` are already escaped by the caller as
// each path requires (server raw, client esc'd). `delBtnHtml` differs per path.
export const chatHeader = (p: {
  authorHtml: string;
  timeHtml: string;
  utc: string;
  addBtnHtml: string;
  replyBtnHtml: string;
  delBtnHtml: string;
}): string =>
  '<span class="chat-msg-author">' + p.authorHtml + '</span>' +
  '<span class="chat-time" data-utc="' + p.utc + '">' + p.timeHtml + '</span>' +
  p.addBtnHtml + p.replyBtnHtml + p.delBtnHtml;

// One reaction pill. `emoji` MUST be pre-escaped by the caller. `mine` adds the
// .is-mine highlight class. Note the literal space between emoji and the count.
export const chatReactionPill = (
  messageId: number | string,
  emoji: string,
  count: number,
  mine: boolean,
): string =>
  '<button type="button" class="chat-react-pill' + (mine ? ' is-mine' : '') +
  '" data-react="' + messageId + '" data-emoji="' + emoji + '">' + emoji +
  ' <span class="chat-react-n">' + count + '</span></button>';

// The "+" add-reaction button (static; margin-left:auto pushes it right).
export const chatAddBtn = (messageId: number | string): string =>
  '<button type="button" class="chat-react-add" data-react-add="' + messageId +
  '" title="Add reaction" aria-label="Add reaction" style="margin-left:auto;">+</button>';

// The reply button. `authorEsc` MUST be pre-escaped (goes in data-reply-author).
export const chatReplyBtn = (messageId: number | string, authorEsc: string): string =>
  '<button type="button" class="chat-reply-btn" data-reply="' + messageId +
  '" data-reply-author="' + authorEsc + '" title="Reply" aria-label="Reply">↩</button>';

// Optimistic send: which locally-shown pending message does this server echo
// confirm? Oldest pending (or failed - a late echo still wins) entry with the
// same content, only for my own messages. Returns -1 when none match. The DO
// trims + caps content before echoing, so the caller stores the same trimmed,
// capped string it sends.
export const chatPendingMatch = (
  pending: { content: string }[],
  msg: { author_name: string; content: string },
  me: string,
): number => {
  if (!me || msg.author_name !== me) return -1;
  for (let i = 0; i < pending.length; i++) {
    if (pending[i]!.content === msg.content) return i;
  }
  return -1;
};

// Optimistic send: ms to wait before the next socket send so the DO's per-sender
// cooldown never rejects it. 0 = send now. Queueing instead of erroring is what
// makes bursts feel instant. lastSentAt <= 0 means nothing sent yet.
export const chatSendDelay = (lastSentAt: number, now: number, cooldownMs: number): number =>
  lastSentAt <= 0 ? 0 : Math.max(0, lastSentAt + cooldownMs - now);

// Clickable nick: opens the name menu (card + actions). `nameEsc` MUST be
// pre-escaped; it is both the label and the lookup key.
export const chatNick = (nameEsc: string): string =>
  '<button type="button" class="chat-nick" data-nick="' + nameEsc + '">' + nameEsc + '</button>';

// IRC-style command parse. A command is "/" + letters, then end or a space:
// "/me waves" -> {name:'me', arg:'waves'}. "/r/coping is nice" and "/ hi" are
// NOT commands (plain text), so links and paths still send normally.
export const chatParseCommand = (text: string): { name: string; arg: string } | null => {
  if (text.charAt(0) !== '/') return null;
  let i = 1;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    const letter = (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
    if (!letter) break;
    i++;
  }
  if (i === 1) return null;
  if (i < text.length && text.charAt(i) !== ' ') return null;
  return { name: text.slice(1, i).toLowerCase(), arg: text.slice(i).trim() };
};

// "/me waves" is stored as typed and rendered as an action line. Returns the
// action text, or null for an ordinary message.
export const chatMeRest = (content: string): string | null =>
  content.slice(0, 4) === '/me ' && content.length > 4 ? content.slice(4) : null;

// Action-line body. Both args MUST be pre-escaped/linkified by the caller.
export const chatActionBody = (authorEsc: string, restHtml: string): string =>
  '<em class="chat-action">* ' + authorEsc + ' ' + restHtml + '</em>';

// Does this message @mention the viewer? Never for the viewer's own lines.
export const chatIsMention = (content: string, me: string, author: string): boolean =>
  !!me && author !== me && content.toLowerCase().indexOf('@' + me.toLowerCase()) >= 0;

// Tag a built bubble as a mention of the viewer (first class attr only).
export const chatMarkMention = (bubbleHtml: string): string =>
  bubbleHtml.replace('class="chat-message', 'class="chat-message chat-mention');

// Pseudo-participant entry for the engagement bot. Not real presence - always
// pinned first in the online list when the bot is enabled. Clicking it fills
// the compose input with "/bot help" rather than opening a DM/profile link,
// so it is a <button>, not the <a> real users get. `nameEsc` MUST be
// pre-escaped.
export const chatBotItem = (nameEsc: string): string =>
  '<li class="chat-user-item chat-bot-item">' +
  '<button type="button" class="chat-bot-item-btn" data-bot-fill title="Ask ' + nameEsc + ' for help">' +
  '<span class="chat-user-av chat-bot-av">🤝</span>' +
  '<span class="chat-user-nm">' + nameEsc + '</span>' +
  '</button></li>';

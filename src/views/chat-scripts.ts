// Inline <script> bodies for renderChat, extracted byte-identical from
// views/chat.ts. Rendered into the same two <script> tags, same order.
// chat-script-syntax.test.ts parses both blocks; template-literal escape
// rules apply (\\n, \\/, \\s) - these bodies contain none today.

// Block 1: scroll position + time localization + error clearing.
export const CHAT_SCRIPT_BOOT = `
(function() {
  let wasNearBottom = true;
  let messageCount = 0;

  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  function scrollToBottom(force) {
    const el = document.getElementById('chat-messages');
    if (el && (force || wasNearBottom)) el.scrollTop = el.scrollHeight;
  }

  function localizeTimes() {
    document.querySelectorAll('.chat-time[data-utc]').forEach(el => {
      if (el.dataset.localized) return;
      const d = new Date(el.getAttribute('data-utc'));
      el.textContent = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
      el.dataset.localized = '1';
    });
  }

  localizeTimes();

  var chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.addEventListener('input', () => {
    document.getElementById('chat-error').textContent = '';
  });

  window.addEventListener('load', () => setTimeout(() => scrollToBottom(true), 100));
})();`;

// Block 2: WS/poll transport, reactions, reply state. `buildersSrc` is the
// serialized chat-message builder source (CHAT_BUILDERS_SRC in chat.ts) -
// interpolated at the exact position the original block held it.
export function chatMainScript(buildersSrc: string): string {
  return `
(function () {
  var root = document.getElementById('chat-root');
  var box = document.getElementById('chat-messages');
  if (!root || !box) return;
${buildersSrc}
  var me = root.dataset.me || '';
  var isMod = root.dataset.ismod === '1';
  var botDisplayName = root.dataset.botName || '';
  var room = root.dataset.room || 'chat';
  var roomQ = '&room=' + encodeURIComponent(room);
  // Dock mode (src/views/chat-dock.ts): lives in the page shell, connects
  // lazily on first show, switches rooms in place.
  var isDock = root.dataset.dock === '1';
  var started = false;
  var connGen = 0; // bumps on room switch; stale sockets/timers check it and stand down
  var form = document.querySelector('.chat-input-row');
  var input = document.getElementById('chat-input');
  var errBox = document.getElementById('chat-error');
  var participants = document.getElementById('chat-participants');

  var ws = null, retries = 0, pollTimer = null, kaTimer = null;

  // --- Quote/reply pending state ---
  var pendingReplyId = null;
  var replyBar = document.getElementById('chat-reply-bar');
  var replyBarAuthor = document.getElementById('chat-reply-bar-author');
  var replyCancel = document.getElementById('chat-reply-cancel');

  function setReply(id, author) {
    pendingReplyId = Number(id) || null;
    if (replyBarAuthor) replyBarAuthor.textContent = author || '';
    if (replyBar) replyBar.classList.add('active');
    if (input) input.focus();
  }
  function clearReply() {
    pendingReplyId = null;
    if (replyBar) replyBar.classList.remove('active');
  }
  if (replyCancel) replyCancel.addEventListener('click', clearReply);

  // --- Typing indicator state (ephemeral) ---
  var typingEl = document.getElementById('chat-typing');
  var typingNames = {};        // name -> expiry timestamp (ms)
  var typingSweep = null;
  var lastTypingSent = 0;      // last time we emitted on:true
  var typingIdleTimer = null;  // fires on:false after idle
  var amTyping = false;

  function sendTyping(on) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: 'typing', on: !!on })); } catch (e) {}
  }
  function renderTyping() {
    if (!typingEl) return;
    var names = [];
    for (var n in typingNames) { if (typingNames.hasOwnProperty(n)) names.push(n); }
    var txt = '';
    if (names.length === 1) txt = esc(names[0]) + ' is typing…';
    else if (names.length === 2) txt = esc(names[0]) + ' and ' + esc(names[1]) + ' are typing…';
    else if (names.length > 2) txt = 'Several people are typing…';
    typingEl.innerHTML = txt;
  }
  function setTyping(name, on) {
    if (!name || name === me) return; // never show myself
    if (ignored[name]) return;
    if (on) typingNames[name] = Date.now() + 5000; // auto-expire guard
    else delete typingNames[name];
    renderTyping();
  }
  function clearTyping(name) {
    if (typingNames.hasOwnProperty(name)) { delete typingNames[name]; renderTyping(); }
  }
  function sweepTyping() {
    var now = Date.now(), changed = false;
    for (var n in typingNames) {
      if (typingNames.hasOwnProperty(n) && typingNames[n] <= now) { delete typingNames[n]; changed = true; }
    }
    if (changed) renderTyping();
  }
  typingSweep = setInterval(sweepTyping, 1000);

  function onInputTyping() {
    var now = Date.now();
    // Emit on:true at most once per ~2s while continuously typing.
    if (!amTyping || now - lastTypingSent > 2000) {
      amTyping = true;
      lastTypingSent = now;
      sendTyping(true);
    }
    // Reset idle timer: 3s of no keystrokes -> on:false.
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = setTimeout(stopTyping, 3000);
  }
  function stopTyping() {
    if (typingIdleTimer) { clearTimeout(typingIdleTimer); typingIdleTimer = null; }
    if (amTyping) { amTyping = false; sendTyping(false); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Fixed emoji whitelist; MUST match ALLOWED_REACTIONS in the DO + server render.
  var ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];
  // (id|emoji) keys this client has reacted with - drives .is-mine highlight.
  // Seeded from server-rendered .is-mine pills so a live broadcast on a pill the
  // viewer already reacted to (prior session) keeps its highlight.
  var myReactions = {};
  function seedMyReactions() {
    document.querySelectorAll('.chat-react-pill.is-mine[data-react]').forEach(function (p) {
      myReactions[reactKey(p.getAttribute('data-react'), p.getAttribute('data-emoji'))] = 1;
    });
  }

  function linkify(s) {
    var out = esc(s);
    // Forum-thread shorthand BEFORE the URL rule. Boundary-capture guard
    // (^|[^\\w\\/]) (NOT lookbehind - that SyntaxErrors on old Safari and would
    // brick this whole IIFE) skips /t/ inside a real URL; the pre group is re-emitted.
    out = out.replace(/(^|[^\\w\\/])t\\/([A-Za-z0-9]{3,12})(#post-[A-Za-z0-9]+)?/g, function (_m, pre, id, anchor) {
      anchor = anchor || '';
      return pre + '<a href="/t/' + id + anchor + '" class="chat-link">t/' + id + anchor + '</a>';
    });
    out = out.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" class="chat-link" target="_blank" rel="noopener nofollow">$1</a>');
    return out;
  }
  function lastId() {
    // Last CONFIRMED message. Pending bubbles carry no data-id and may sit at
    // the bottom, so :last-child would miss the real cursor.
    var all = box.querySelectorAll('.chat-message[data-id]');
    var el = all.length ? all[all.length - 1] : null;
    return el ? el.dataset.id : '0';
  }
  function fmtTime(utc) {
    try { return new Date(utc).toLocaleTimeString(); } catch (e) { return ''; }
  }
  function utcOf(created_at) {
    return created_at.indexOf('T') >= 0 ? created_at : created_at.replace(' ', 'T') + 'Z';
  }
  function appendMsg(m) {
    if (document.getElementById('chat-msg-' + m.id)) return;
    removeEmptyHints();
    // A delivered message means its author stopped typing - clear their state.
    clearTyping(m.author_name);
    var h = buildMsgHtml(m);
    // My own echo confirms a pending bubble: swap it in place (keeps the order
    // the sender saw) instead of appending a duplicate at the bottom.
    var pi = chatPendingMatch(pending, m, me);
    if (pi >= 0) {
      var p = pending.splice(pi, 1)[0];
      if (p.timer) clearTimeout(p.timer);
      if (p.el && p.el.parentNode) {
        p.el.insertAdjacentHTML('beforebegin', h);
        p.el.remove();
        return;
      }
    }
    box.insertAdjacentHTML('beforeend', h);
    if (ignored[m.author_name]) applyIgnores();
    box.scrollTop = box.scrollHeight;
  }
  function buildMsgHtml(m) {
    var mine = m.author_name === me;
    var utc = utcOf(m.created_at);
    var del = isMod
      ? '<button class="chat-del" data-del="' + m.id + '" title="Delete" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px;font-weight:700;">✕</button>'
      : '';
    var reply = chatReplyBtn(m.id, esc(m.author_name));
    var add = chatAddBtn(m.id);
    var quote = m.reply_to_id
      ? '<div class="chat-reply-quote">↳ <span class="chat-reply-author">' + esc(m.reply_to_author || '') + '</span>: ' + esc(m.reply_to_excerpt || '') + '</div>'
      : '';
    // Pre-existing reactions arrive on backlog rows (additive reactions field).
    // Render the same pill markup the server (renderChatReactions) and live
    // applyReaction path use, and seed myReactions for the viewer's own pills so
    // they stay highlighted and toggle correctly after reload.
    var pills = '';
    if (m.reactions && m.reactions.length) {
      m.reactions.forEach(function (r) {
        if (!r || r.count <= 0) return;
        if (r.mine) myReactions[reactKey(m.id, r.emoji)] = 1;
        pills += chatReactionPill(m.id, esc(r.emoji), r.count, !!r.mine);
      });
    }
    // Others' names open the name menu; mine and guests stay plain text.
    var guest = m.author_name.indexOf('[guest]') === 0;
    var header = chatHeader({
      authorHtml: mine || guest ? esc(m.author_name) : chatNick(esc(m.author_name)),
      timeHtml: esc(fmtTime(utc)),
      utc: esc(utc),
      addBtnHtml: add,
      replyBtnHtml: reply,
      delBtnHtml: del,
    });
    var b = chatBubble({
      id: m.id,
      isMe: mine,
      headerHtml: header,
      quoteHtml: quote,
      bodyHtml: bodyFor(m.author_name, m.content),
      reactionsHtml: pills,
    });
    if (chatIsMention(m.content, me, m.author_name)) b = chatMarkMention(b);
    return b;
  }
  // "/me waves" renders as an action line; everything else is linkified text.
  function bodyFor(author, content) {
    var rest = chatMeRest(content);
    return rest !== null ? chatActionBody(esc(author), linkify(rest)) : linkify(content);
  }

  // --- Optimistic send ---
  // A message renders the instant it is submitted, then the server echo swaps
  // in the real row (appendMsg). Sends are queued behind the DO's per-sender
  // cooldown (COOLDOWN_MS 2000 in durable/chat-room.ts, +100ms margin) so a
  // burst waits its turn instead of bouncing with "Wait Ns".
  var SEND_GAP_MS = 2100;
  var ECHO_TIMEOUT_MS = 6000;
  var pending = [];       // shown, not yet confirmed: {key, content, replyId, el, timer, sentAt}
  var sendQueue = [];     // subset of pending not yet handed to the socket
  var queueTimer = null;
  var lastSentAt = 0;
  var pendingSeq = 0;

  function showPending(content, replyId) {
    removeEmptyHints();
    var key = 'p' + (++pendingSeq);
    var header = chatHeader({
      authorHtml: esc(me),
      timeHtml: 'sending…',
      utc: '',
      addBtnHtml: '',
      replyBtnHtml: '',
      delBtnHtml: '',
    });
    box.insertAdjacentHTML('beforeend', chatBubble({
      id: key, isMe: true, headerHtml: header, quoteHtml: '',
      bodyHtml: bodyFor(me, content), reactionsHtml: '',
    }));
    var el = document.getElementById('chat-msg-' + key);
    if (el) { el.removeAttribute('data-id'); el.classList.add('chat-pending'); }
    box.scrollTop = box.scrollHeight;
    var p = { key: key, content: content, replyId: replyId, el: el, timer: null, sentAt: 0 };
    pending.push(p);
    return p;
  }
  function markFailed(p) {
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    var qi = sendQueue.indexOf(p);
    if (qi >= 0) sendQueue.splice(qi, 1);
    if (!p.el) return;
    p.el.classList.remove('chat-pending');
    p.el.classList.add('chat-failed');
    var t = p.el.querySelector('.chat-time');
    if (t) t.innerHTML = 'Not sent <button type="button" class="chat-retry" data-retry="' + p.key + '">Retry</button>';
  }
  function pumpQueue() {
    if (queueTimer || !sendQueue.length) return;
    var wait = chatSendDelay(lastSentAt, Date.now(), SEND_GAP_MS);
    if (wait > 0) {
      queueTimer = setTimeout(function () { queueTimer = null; pumpQueue(); }, wait);
      return;
    }
    var p = sendQueue.shift();
    if (!ws || ws.readyState !== WebSocket.OPEN) { markFailed(p); pumpQueue(); return; }
    var payload = { type: 'send', content: p.content };
    if (p.replyId) payload.replyToId = p.replyId;
    try { ws.send(JSON.stringify(payload)); } catch (e) { markFailed(p); pumpQueue(); return; }
    lastSentAt = Date.now();
    p.sentAt = lastSentAt;
    p.timer = setTimeout(function () { markFailed(p); }, ECHO_TIMEOUT_MS);
    pumpQueue();
  }
  // A send-path {type:'error'} goes only to the sender, and answers the oldest
  // message already handed to the socket.
  function failOldestSent() {
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].sentAt && pending[i].timer) { markFailed(pending[i]); return; }
    }
  }
  // --- Reactions ---
  function reactKey(id, emoji) { return String(id) + '|' + emoji; }
  function sendReact(id, emoji) {
    if (ALLOWED_REACTIONS.indexOf(emoji) < 0) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Optimistic local toggle of my own highlight; server count is authoritative.
      var k = reactKey(id, emoji);
      if (myReactions[k]) delete myReactions[k]; else myReactions[k] = 1;
      try { ws.send(JSON.stringify({ type: 'react', id: Number(id), emoji: emoji })); } catch (e) {}
    }
  }
  function reactRow(id) {
    var msg = document.getElementById('chat-msg-' + id);
    return msg ? msg.querySelector('.chat-reactions') : null;
  }
  // Apply a {type:'reaction'} broadcast: set the pill's count, create/remove as needed.
  function applyReaction(id, emoji, count) {
    var row = reactRow(id);
    if (!row) return;
    var pill = row.querySelector('.chat-react-pill[data-emoji="' + (window.CSS && CSS.escape ? CSS.escape(emoji) : emoji) + '"]');
    if (count <= 0) { if (pill) pill.remove(); return; }
    var isMine = !!myReactions[reactKey(id, emoji)];
    if (!pill) {
      var addBtn = row.querySelector('.chat-react-add');
      var html = chatReactionPill(id, esc(emoji), count, isMine);
      if (addBtn) addBtn.insertAdjacentHTML('beforebegin', html);
      else row.insertAdjacentHTML('beforeend', html);
    } else {
      var n = pill.querySelector('.chat-react-n');
      if (n) n.textContent = count;
      pill.className = 'chat-react-pill' + (isMine ? ' is-mine' : '');
    }
  }
  // Inline emoji palette near the message's add-button.
  function togglePalette(id, anchorBtn) {
    var existing = document.querySelector('.chat-react-palette');
    var sameRow = existing && existing.getAttribute('data-for') === String(id);
    if (existing) existing.remove();
    if (sameRow) return; // toggle off
    var pal = document.createElement('span');
    pal.className = 'chat-react-palette';
    pal.setAttribute('data-for', String(id));
    pal.innerHTML = ALLOWED_REACTIONS.map(function (e) {
      return '<button type="button" data-pick="' + esc(e) + '">' + esc(e) + '</button>';
    }).join('');
    anchorBtn.parentNode.insertBefore(pal, anchorBtn.nextSibling);
  }
  function closePalette() {
    var existing = document.querySelector('.chat-react-palette');
    if (existing) existing.remove();
  }

  function renderPresence(users) {
    if (!participants) return;
    var items = users.length === 0
      ? '<li style="font-size:12px;color:var(--text-muted);">No one yet</li>'
      : users.map(function (name) {
          var guest = name.indexOf('[guest]') === 0;
          var disp = name.replace(/^\\[guest\\]\\s*/, '');
          var link = guest
            ? '<span class="chat-user-nm">' + esc(disp) + '</span>'
            : '<button type="button" class="chat-user-nm chat-nick" data-nick="' + esc(disp) + '">' + esc(disp) + '</button>';
          // data-nick on the row: on phones only the avatar shows, so tapping
          // it must open the name menu too.
          return '<li class="chat-user-item"' + (guest ? '' : ' data-nick="' + esc(disp) + '"') + '><div class="chat-user-av">' + esc(disp.slice(0, 2).toUpperCase()) + '</div>' + link + '</li>';
        }).join('');
    var botItem = botDisplayName ? chatBotItem(esc(botDisplayName)) : '';
    participants.innerHTML = '<p class="chat-users-label">Online</p><ul style="list-style:none;padding:0;margin:0;">' + botItem + items + '</ul>';
  }
  function markRead() {
    // In the dock, messages only count as read while the dock is on screen;
    // the heartbeat chat badge keys off this cookie.
    if (isDock && !document.body.classList.contains('chat-dock-open')) return;
    document.cookie = 'chat_last_view=' + new Date().toISOString() + ';path=/;max-age=86400;samesite=lax';
  }
  function showErr(msg) {
    if (!errBox) return;
    errBox.textContent = msg;
    setTimeout(function () { if (errBox.textContent === msg) errBox.textContent = ''; }, 4000);
  }
  function startKeepalive() {
    stopKeepalive();
    kaTimer = setInterval(function () { if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 30000);
  }
  function stopKeepalive() { if (kaTimer) { clearInterval(kaTimer); kaTimer = null; } }
  function startPoll() {
    if (pollTimer) return;
    var ph = document.getElementById('chat-loading-placeholder');
    if (ph) ph.remove();
    var tick = function () {
      var gen = connGen;
      fetch('/chat/messages?since=' + lastId() + roomQ, { headers: { 'hx-request': 'true' } })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          if (gen !== connGen) return; // answered for a room we already left
          var tmp = document.createElement('div');
          tmp.innerHTML = t;
          tmp.querySelectorAll('.chat-message').forEach(function (el) {
            if (!document.getElementById(el.id)) { box.appendChild(el); box.scrollTop = box.scrollHeight; }
          });
          seedMyReactions();
          applyIgnores();
        }).catch(function () {});
    };
    tick();
    pollTimer = setInterval(tick, 15000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function connect() {
    var gen = connGen;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var sock = new WebSocket(proto + '//' + location.host + '/chat/ws?since=' + lastId() + roomQ);
    ws = sock;
    ws.onopen = function () {
      if (gen !== connGen) { try { sock.close(); } catch (e) {} return; }
      retries = 0; stopPoll();
      presenceBase = null; // first roster after (re)connect is a baseline, not joins
      var ph = document.getElementById('chat-loading-placeholder');
      if (ph) ph.remove();
      startKeepalive();
    };
    ws.onmessage = function (ev) {
      if (gen !== connGen) return; // a socket from the room we just left
      if (ev.data === 'pong') return;
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'backlog') { d.messages.forEach(appendMsg); markRead(); maybeShowEmptyHints(); }
      else if (d.type === 'message') { appendMsg(d); markRead(); }
      else if (d.type === 'delete') { var el = document.getElementById('chat-msg-' + d.id); if (el) el.remove(); }
      else if (d.type === 'presence') { renderPresence(d.users); presenceDiff(d.users); }
      else if (d.type === 'typing') { setTyping(d.name, d.on); }
      else if (d.type === 'reaction') { applyReaction(d.id, d.emoji, d.count); }
      else if (d.type === 'error') { failOldestSent(); showErr(d.message); }
    };
    ws.onclose = function () {
      if (gen !== connGen) return;
      stopKeepalive(); scheduleReconnect();
    };
    ws.onerror = function () { try { sock.close(); } catch (e) {} };
  }
  function scheduleReconnect() {
    retries++;
    if (retries > 5) { startPoll(); return; }
    var gen = connGen;
    setTimeout(function () { if (gen === connGen) connect(); }, Math.min(1000 * Math.pow(2, retries), 15000));
  }
  // Dock: switch rooms in place - drop the old socket, clear the window,
  // reconnect to the new room's DO. connGen makes every callback that still
  // belongs to the old room (socket events, reconnect timers, an in-flight
  // poll) a no-op.
  function switchRoom(slug) {
    if (!slug || slug === room) return;
    var tab = root.parentNode && document.querySelector('.chat-wrap--dock [data-chat-room="' + slug.replace(/"/g, '') + '"]');
    if (!tab) return; // not a room this user can read
    connGen++;
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    stopKeepalive(); stopPoll();
    if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
    pending.forEach(function (p) { if (p.timer) clearTimeout(p.timer); });
    pending.length = 0; sendQueue.length = 0;
    typingNames = {}; renderTyping();
    presenceBase = null; clearPendingLeaves();
    clearReply(); hideHints();
    retries = 0;
    box.innerHTML = '<div id="chat-loading-placeholder" style="padding:20px;color:var(--text-muted);font-size:13px;text-align:center;">Connecting…</div>';
    room = slug;
    roomQ = '&room=' + encodeURIComponent(room);
    root.dataset.room = room;
    document.querySelectorAll('.chat-wrap--dock [data-chat-room]').forEach(function (b) {
      var on = b.getAttribute('data-chat-room') === room;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (input) input.placeholder = 'Message ' + tab.textContent;
    try { localStorage.setItem('chat_dock_room', room); } catch (e) {}
    if (started) connect();
  }
  // --- /bot helper (deterministic, ephemeral, viewer-only) ---
  function isBotCmd(v) {
    var c = v.toLowerCase();
    return c === '/bot' || c.indexOf('/bot ') === 0;
  }
  function removeBotPanel() {
    var p = box.querySelector('.bot-panel');
    if (p) p.remove();
  }
  function runBotCommand(cmd) {
    fetch('/bot/panel?cmd=' + encodeURIComponent(cmd), { headers: { 'hx-request': 'true' } })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) {
        if (!t) return;
        removeBotPanel();
        box.insertAdjacentHTML('beforeend', t);
        // insertAdjacentHTML bypasses htmx's own swap path, so hx-get/hx-target
        // on anything inside the panel (e.g. the "Start a post" link) is inert
        // until htmx is told to scan the new node.
        var panelEl = box.querySelector('.bot-panel');
        if (panelEl && window.htmx) window.htmx.process(panelEl);
        box.scrollTop = box.scrollHeight;
      }).catch(function () {});
  }
  function removeEmptyHints() {
    var h = document.getElementById('chat-empty-hints');
    if (h) h.remove();
  }
  function maybeShowEmptyHints() {
    if (box.querySelector('.chat-message') || document.getElementById('chat-empty-hints')) return;
    box.insertAdjacentHTML('beforeend',
      '<div id="chat-empty-hints" style="padding:20px;color:var(--text-muted);font-size:13px;line-height:1.7;">' +
      'Quiet in here right now. A few ways to break the ice:' +
      '<br>&bull; Ask a low-pressure question - "what made this week easier?" works.' +
      '<br>&bull; Ask what others wish they had known earlier.' +
      '<br>&bull; Type <strong>/bot topic</strong> for a ready-made starter (only you will see the helper).' +
      '</div>');
  }

  function sendMessage(content, replyOverride) {
    var replyId = replyOverride !== undefined ? replyOverride : pendingReplyId;
    // Socket path: show it now, send when the cooldown allows. Guests have no
    // stable name to match the echo against, so they keep the plain path.
    if (ws && ws.readyState === WebSocket.OPEN && me) {
      // Same trim + cap the DO applies, so the echo matches byte-for-byte.
      var p = showPending(content.trim().slice(0, 500), replyId);
      sendQueue.push(p);
      clearReply();
      pumpQueue();
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      var payload = { type: 'send', content: content };
      if (replyId) payload.replyToId = replyId;
      ws.send(JSON.stringify(payload));
      clearReply();
      return;
    }
    // Degraded fallback: POST directly (no htmx), then refresh via poll.
    var fd = new FormData();
    fd.append('content', content);
    fd.append('csrf', root.dataset.csrf || '');
    fd.append('room', room);
    if (replyId) fd.append('reply_to', String(replyId));
    fetch('/chat/messages?room=' + encodeURIComponent(room), {
      method: 'POST',
      body: fd,
      headers: { 'x-csrf-token': root.dataset.csrf || '', 'hx-request': 'true' },
    }).then(function (r) {
      if (!r.ok) { r.text().then(showErr); return; }
      if (!pollTimer) startPoll(); // ensure the new message gets pulled in
    }).catch(function () { showErr('Send failed.'); });
    clearReply();
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input || !input.value.trim()) return;
      var val = input.value.trim();
      input.value = '';
      hideHints();
      stopTyping();
      lastTyped = val;
      // /bot never leaves this browser as a chat message.
      if (isBotCmd(val)) { runBotCommand(val); return; }
      // Local IRC-style commands run here and never post. /me is the one that
      // does post (rendered as an action line).
      var cmd = chatParseCommand(val);
      if (cmd && cmd.name !== 'me') { runLocalCommand(cmd); return; }
      if (cmd && cmd.name === 'me' && !cmd.arg) { showErr('Usage: /me waves hello'); return; }
      sendMessage(val);
    });
  }
  if (input) {
    input.addEventListener('input', function () {
      // Empty field -> idle immediately; otherwise debounce a typing signal.
      if (!input.value.trim()) stopTyping();
      else onInputTyping();
      updateHints();
    });
    input.addEventListener('keydown', onInputKey);
    input.addEventListener('blur', function () { setTimeout(hideHints, 150); });
  }
  if (participants) {
    participants.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var pn = e.target.closest('[data-nick]');
      if (pn) { openMenu(pn.getAttribute('data-nick'), pn); return; }
      if (!e.target.closest('[data-bot-fill]')) return;
      if (input) {
        input.value = '/bot help';
        input.focus();
        onInputTyping();
      }
    });
  }
  box.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('[data-bot-close]')) { removeBotPanel(); return; }
    var nickBtn = e.target.closest('.chat-nick');
    if (nickBtn) { openMenu(nickBtn.getAttribute('data-nick'), nickBtn); return; }
    var retry = e.target.closest('[data-retry]');
    if (retry) {
      var rk = retry.getAttribute('data-retry');
      for (var ri = 0; ri < pending.length; ri++) {
        if (pending[ri].key !== rk) continue;
        var rp = pending.splice(ri, 1)[0];
        if (rp.el) rp.el.remove();
        sendMessage(rp.content, rp.replyId);
        break;
      }
      return;
    }
    var rbtn = e.target.closest('[data-reply]');
    if (rbtn) {
      setReply(rbtn.getAttribute('data-reply'), rbtn.getAttribute('data-reply-author'));
      return;
    }
    // Reaction pill toggle.
    var pill = e.target.closest('[data-react]');
    if (pill) {
      sendReact(pill.getAttribute('data-react'), pill.getAttribute('data-emoji'));
      return;
    }
    // Pick an emoji from the inline palette.
    var pick = e.target.closest('[data-pick]');
    if (pick) {
      var pal = pick.closest('.chat-react-palette');
      var forId = pal ? pal.getAttribute('data-for') : null;
      if (forId) sendReact(forId, pick.getAttribute('data-pick'));
      closePalette();
      return;
    }
    // Open/close the add-reaction palette for this message.
    var addBtn = e.target.closest('[data-react-add]');
    if (addBtn) {
      togglePalette(addBtn.getAttribute('data-react-add'), addBtn);
      return;
    }
    var btn = e.target.closest('[data-del]');
    if (!btn) return;
    var id = Number(btn.dataset.del);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'delete', id: id }));
  });
  // Dismiss an open emoji palette when clicking anywhere that isn't the palette
  // or an add-button (the box listener handles the in-box toggle/pick cases).
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('.chat-react-palette') || e.target.closest('[data-react-add]')) return;
    closePalette();
  });
  // ===== IRC-style functions =====

  // --- Local system lines (never sent, no data-id so lastId() skips them) ---
  function sysLine(text) {
    var near = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
    box.insertAdjacentHTML('beforeend', '<div class="chat-sys">' + esc(text) + '</div>');
    if (near) box.scrollTop = box.scrollHeight;
  }

  // --- Ignore: hides someone for this viewer only (localStorage) ---
  var ignored = {};
  try {
    (JSON.parse(localStorage.getItem('chat_ignore') || '[]') || []).forEach(function (n) { ignored[n] = 1; });
  } catch (e) {}
  function saveIgnores() {
    try { localStorage.setItem('chat_ignore', JSON.stringify(Object.keys(ignored))); } catch (e) {}
  }
  function authorOf(el) {
    var a = el.querySelector('.chat-msg-author');
    return a ? a.textContent : '';
  }
  function applyIgnores() {
    box.querySelectorAll('.chat-message').forEach(function (el) {
      el.classList.toggle('chat-ignored', !!ignored[authorOf(el)]);
    });
  }
  function setIgnored(nick, on) {
    if (!nick || nick === me) return;
    if (on) ignored[nick] = 1; else delete ignored[nick];
    saveIgnores();
    applyIgnores();
    sysLine(on ? 'Ignoring ' + nick + '. Only you stop seeing them. /unignore ' + nick + ' to undo.' : 'No longer ignoring ' + nick + '.');
  }

  // --- Join / leave lines from presence changes ---
  // With chat open on every page, a full page load drops and re-opens the
  // socket. A leave only prints if the person is still gone after a grace
  // period, and a quick return prints nothing - so browsing isn't spam.
  var LEAVE_GRACE_MS = 15000;
  var presenceBase = null;
  var onlineNames = [];
  var pendingLeaves = {}; // name -> timer
  function clearPendingLeaves() {
    Object.keys(pendingLeaves).forEach(function (n) { clearTimeout(pendingLeaves[n]); });
    pendingLeaves = {};
  }
  function presenceDiff(users) {
    onlineNames = users.slice();
    var now = {};
    users.forEach(function (n) { now[n] = 1; });
    if (presenceBase) {
      Object.keys(now).forEach(function (n) {
        if (presenceBase[n] || n === me) return;
        if (pendingLeaves[n]) { clearTimeout(pendingLeaves[n]); delete pendingLeaves[n]; return; }
        if (!ignored[n]) sysLine('→ ' + n.replace('[guest] ', '') + ' joined');
      });
      Object.keys(presenceBase).forEach(function (n) {
        if (now[n] || n === me || pendingLeaves[n]) return;
        var gen = connGen;
        pendingLeaves[n] = setTimeout(function () {
          delete pendingLeaves[n];
          if (gen === connGen && onlineNames.indexOf(n) < 0 && !ignored[n]) sysLine('← ' + n.replace('[guest] ', '') + ' left');
        }, LEAVE_GRACE_MS);
      });
    }
    presenceBase = now;
  }

  // --- Name menu (card + actions), fetched from /chat/user/:name ---
  var menu = document.getElementById('chat-nick-menu');
  var scrim = document.getElementById('chat-nick-scrim');
  // The menu is moved to <body> while open (escapes .chat-wrap's stacking
  // context on phones). Drop copies left there by an earlier chat page visit.
  document.querySelectorAll('body > #chat-nick-menu, body > #chat-nick-scrim').forEach(function (el) {
    if (el !== menu && el !== scrim) el.remove();
  });
  var menuCache = {};
  var menuAnchor = null;
  function isPhone() { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
  function positionMenu() {
    if (!menu || menu.hidden || isPhone()) return;
    var r = (menuAnchor && menuAnchor.isConnected ? menuAnchor : input).getBoundingClientRect();
    var w = menu.offsetWidth || 280, h = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }
  function fillMenu(html) {
    menu.innerHTML = html;
    var nick = menu.dataset.nick;
    var il = menu.querySelector('.cnm-ignore-label');
    if (il) il.textContent = ignored[nick] ? 'Stop ignoring' : 'Ignore in chat';
    if (window.htmx) window.htmx.process(menu);
    positionMenu();
    var first = menu.querySelector('.cnm-item');
    if (first && !isPhone()) first.focus();
  }
  function openMenu(nick, anchor) {
    if (!menu || !nick) return;
    if (menu.parentNode !== document.body) {
      document.body.appendChild(scrim);
      document.body.appendChild(menu);
    }
    if (menuAnchor && menuAnchor.classList) menuAnchor.classList.remove('open');
    menuAnchor = anchor || null;
    if (menuAnchor && menuAnchor.classList) menuAnchor.classList.add('open');
    menu.dataset.nick = nick;
    menu.hidden = false;
    if (scrim) scrim.hidden = false;
    if (menuCache[nick]) { fillMenu(menuCache[nick]); return; }
    menu.innerHTML = '<div class="cnm-loading">Loading ' + esc(nick) + '…</div>';
    positionMenu();
    fetch('/chat/user/' + encodeURIComponent(nick), { headers: { 'hx-request': 'true' } })
      .then(function (r) {
        if (r.ok) return r.text().then(function (t) { menuCache[nick] = t; return t; });
        return r.status === 404
          ? '<div class="cnm-loading">No member named ' + esc(nick) + '.</div>'
          : '<div class="cnm-loading">Members only.</div>';
      })
      .then(function (t) { if (!menu.hidden && menu.dataset.nick === nick) fillMenu(t); })
      .catch(function () { if (!menu.hidden) menu.innerHTML = '<div class="cnm-loading">Could not load.</div>'; });
  }
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (scrim) scrim.hidden = true;
    if (menuAnchor && menuAnchor.classList) menuAnchor.classList.remove('open');
    menuAnchor = null;
  }
  function insertMention(nick) {
    if (!input) return;
    var v = input.value;
    var tag = '@' + nick + ' ';
    if (v.indexOf(tag) < 0) input.value = (v && v.charAt(v.length - 1) !== ' ' ? v + ' ' : v) + tag;
    input.focus();
  }
  function purgeMessages(nick) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { showErr('Not connected.'); return; }
    var n = 0;
    box.querySelectorAll('.chat-message[data-id]').forEach(function (el) {
      if (authorOf(el) !== nick) return;
      try { ws.send(JSON.stringify({ type: 'delete', id: Number(el.dataset.id) })); n++; } catch (e) {}
    });
    sysLine(n ? 'Deleted ' + n + ' message' + (n === 1 ? '' : 's') + ' from ' + nick + '.' : 'Nothing from ' + nick + ' on screen.');
  }
  function toggleBlock(btn, nick) {
    var was = btn.getAttribute('data-blocked') === '1';
    if (!was && !window.confirm('Block ' + nick + '? You can unblock them from their profile.')) return;
    fetch('/u/' + encodeURIComponent(nick) + '/block', {
      method: 'POST',
      headers: { 'x-csrf-token': root.dataset.csrf || '', 'hx-request': 'true' },
    }).then(function (r) {
      if (!r.ok) { showErr('Could not update block.'); return; }
      delete menuCache[nick];
      btn.setAttribute('data-blocked', was ? '0' : '1');
      var lbl = btn.querySelector('.cnm-block-label');
      if (lbl) lbl.textContent = was ? 'Block' : 'Unblock';
      sysLine(was ? 'Unblocked ' + nick + '.' : 'Blocked ' + nick + '.');
    }).catch(function () { showErr('Could not update block.'); });
  }
  if (menu) {
    menu.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var act = e.target.closest('[data-nick-act]');
      if (!act) return;
      var kind = act.getAttribute('data-nick-act');
      var nick = act.getAttribute('data-nick') || menu.dataset.nick;
      if (kind === 'close') { closeMenu(); return; } // the link itself navigates
      if (kind === 'mention') { closeMenu(); insertMention(nick); return; }
      if (kind === 'ignore') { closeMenu(); setIgnored(nick, !ignored[nick]); return; }
      if (kind === 'block') { toggleBlock(act, nick); return; }
      if (kind === 'purge') {
        if (window.confirm('Delete every message from ' + nick + ' shown here?')) purgeMessages(nick);
        closeMenu();
      }
    });
  }
  if (scrim) scrim.addEventListener('click', closeMenu);
  document.addEventListener('click', function (e) {
    if (!menu || menu.hidden || !e.target.closest) return;
    // Any opener ([data-nick]: nick buttons, roster rows) handles itself.
    if (e.target.closest('#chat-nick-menu') || e.target.closest('[data-nick]')) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu && !menu.hidden) { closeMenu(); if (input) input.focus(); }
  });
  window.addEventListener('resize', positionMenu);
  // Page navigation closes it; the report form swapping INSIDE the menu must not.
  document.body.addEventListener('htmx:beforeSwap', function (e) {
    var t = e.detail && e.detail.target;
    if (t && t.classList && t.classList.contains('main')) closeMenu();
  });

  // --- Commands ---
  var COMMANDS = [
    ['me', 'Describe an action: * you wave'],
    ['msg', 'Private message: /msg name'],
    ['whois', 'Show a member card: /whois name'],
    ['ignore', 'Hide someone, only for you'],
    ['unignore', 'Stop ignoring someone'],
    ['clear', 'Clear this window, only for you'],
    ['bot', 'Ask the helper (only you see it)'],
    ['help', 'List these commands'],
  ];
  function nickArg(arg) {
    var n = (arg || '').split(' ')[0] || '';
    return n.charAt(0) === '@' ? n.slice(1) : n;
  }
  function runLocalCommand(cmd) {
    var nick = nickArg(cmd.arg);
    if (cmd.name === 'msg') {
      if (!nick) { showErr('Usage: /msg name'); return; }
      window.location.href = '/dms/' + encodeURIComponent(nick);
    } else if (cmd.name === 'whois') {
      if (!nick) { showErr('Usage: /whois name'); return; }
      openMenu(nick, input);
    } else if (cmd.name === 'ignore') {
      if (!nick) {
        var list = Object.keys(ignored);
        sysLine(list.length ? 'Ignoring: ' + list.join(', ') : 'You are not ignoring anyone.');
        return;
      }
      if (nick === me) { showErr('You cannot ignore yourself.'); return; }
      setIgnored(nick, true);
    } else if (cmd.name === 'unignore') {
      if (!nick) { showErr('Usage: /unignore name'); return; }
      setIgnored(nick, false);
    } else if (cmd.name === 'clear') {
      box.querySelectorAll('.chat-message, .chat-sys, .bot-panel').forEach(function (el) { el.remove(); });
    } else if (cmd.name === 'help') {
      sysLine('Commands: ' + COMMANDS.map(function (c) { return '/' + c[0]; }).join('  ') + '. Click any name for more.');
    } else {
      showErr('Unknown command /' + cmd.name + '. Type /help.');
    }
  }

  // --- Suggestions: "/" commands and "@" names ---
  var hintsEl = document.getElementById('chat-hints');
  var hintItems = [];
  var hintSel = 0;
  var lastTyped = '';
  function knownNames() {
    var seen = {}, out = [];
    function add(n) {
      if (!n || n === me || n.indexOf('[guest]') === 0 || seen[n]) return;
      seen[n] = 1; out.push(n);
    }
    onlineNames.forEach(add);
    box.querySelectorAll('.chat-msg-author .chat-nick').forEach(function (el) { add(el.getAttribute('data-nick')); });
    return out;
  }
  function hideHints() {
    hintItems = [];
    if (hintsEl) { hintsEl.hidden = true; hintsEl.innerHTML = ''; }
  }
  function renderHints() {
    if (!hintsEl) return;
    if (!hintItems.length) { hideHints(); return; }
    hintsEl.innerHTML = hintItems.map(function (it, i) {
      return '<button type="button" role="option" class="chat-hint' + (i === hintSel ? ' sel' : '') + '" aria-selected="' + (i === hintSel ? 'true' : 'false') + '" data-hint="' + i + '">' +
        '<span class="chat-hint-cmd">' + esc(it.label) + '</span>' +
        (it.desc ? '<span class="chat-hint-desc">' + esc(it.desc) + '</span>' : '') + '</button>';
    }).join('') + '<div class="chat-hint-foot">↑ ↓ choose · Tab complete · Esc close</div>';
    hintsEl.hidden = false;
  }
  function updateHints() {
    if (!input) return;
    var v = input.value;
    var caret = input.selectionStart == null ? v.length : input.selectionStart;
    var before = v.slice(0, caret);
    hintItems = [];
    if (v.charAt(0) === '/' && v.indexOf(' ') < 0) {
      var q = v.slice(1).toLowerCase();
      COMMANDS.forEach(function (c) {
        if (c[0].indexOf(q) === 0) hintItems.push({ label: '/' + c[0], desc: c[1], text: '/' + c[0] + ' ', start: 0, end: v.length });
      });
    } else {
      var at = before.lastIndexOf('@');
      if (at >= 0 && (at === 0 || before.charAt(at - 1) === ' ') && before.slice(at + 1).indexOf(' ') < 0) {
        var nq = before.slice(at + 1).toLowerCase();
        knownNames().forEach(function (n) {
          if (hintItems.length < 6 && n.toLowerCase().indexOf(nq) === 0) {
            hintItems.push({ label: '@' + n, desc: onlineNames.indexOf(n) >= 0 ? 'online' : '', text: '@' + n + ' ', start: at, end: caret });
          }
        });
      }
    }
    hintSel = 0;
    renderHints();
  }
  function applyHint(i) {
    var it = hintItems[i];
    if (!it || !input) return;
    var v = input.value;
    input.value = v.slice(0, it.start) + it.text + v.slice(it.end);
    var pos = it.start + it.text.length;
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    hideHints();
    input.focus();
  }
  function onInputKey(e) {
    var open = hintsEl && !hintsEl.hidden && hintItems.length;
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        hintSel = (hintSel + (e.key === 'ArrowDown' ? 1 : hintItems.length - 1)) % hintItems.length;
        renderHints();
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); applyHint(hintSel); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideHints(); return; }
      if (e.key === 'Enter') {
        // A fully typed command ("/clear") runs; a partial one completes first.
        var it = hintItems[hintSel];
        if (it && input.value.slice(it.start, it.end).trim() !== it.text.trim()) { e.preventDefault(); applyHint(hintSel); }
        else hideHints();
        return;
      }
    }
    if (e.key === 'ArrowUp' && !input.value && lastTyped) {
      e.preventDefault();
      input.value = lastTyped;
      try { input.setSelectionRange(lastTyped.length, lastTyped.length); } catch (err) {}
    }
  }
  if (hintsEl) {
    // mousedown, not click: keep focus in the input so the pick lands there.
    hintsEl.addEventListener('mousedown', function (e) {
      if (!e.target.closest) return;
      var b = e.target.closest('[data-hint]');
      if (!b) return;
      e.preventDefault();
      applyHint(Number(b.getAttribute('data-hint')));
    });
  }

  seedMyReactions();
  if (!isDock) {
    started = true;
    connect();
  } else {
    // Room tabs switch in place.
    document.querySelectorAll('.chat-wrap--dock [data-chat-room]').forEach(function (b) {
      b.addEventListener('click', function () { switchRoom(b.getAttribute('data-chat-room')); });
    });
    // Come back to the room you were last in.
    try {
      var savedRoom = localStorage.getItem('chat_dock_room');
      if (savedRoom) switchRoom(savedRoom);
    } catch (e) {}
    // The dock controller (chat-dock.ts) calls these.
    window.__chatDockRoom = switchRoom;
    window.__chatDockStart = function () {
      if (started) return;
      started = true;
      connect();
    };
  }
})();`;
}

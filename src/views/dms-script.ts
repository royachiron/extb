// Inline <script> body for the DM thread view, extracted byte-identical from
// views/dms.ts (WS transport, poll fallback, typing indicator). Rendered into
// the same single <script> tag. dms-script-syntax.test.ts parses it;
// template-literal escape rules apply (\\n, \\/, \\s) - none present today.
export const DM_SCRIPT = `
    (function () {
      var root = document.getElementById('dm-root');
      var thread = document.getElementById('dm-thread');
      if (!root || !thread) return;
      var other = root.dataset.other || '';
      var me = root.dataset.me || '';
      var form = document.querySelector('.dm-compose-wrap');
      var ta = document.getElementById('dm-textarea');
      var typingEl = document.getElementById('dm-typing');
      var statusText = document.getElementById('dm-status-text');

      var ws = null, retries = 0, kaTimer = null, poking = false, pokeQueued = false;
      var typingHideTimer = null;       // auto-expire the "typing…" hint
      var lastTypingSent = 0, amTyping = false, typingIdleTimer = null;

      function lastId() {
        var max = 0;
        thread.querySelectorAll('.dm-msg[data-id]').forEach(function (el) {
          var n = Number(el.dataset.id) || 0; if (n > max) max = n;
        });
        return max;
      }

      // Poke the existing poll endpoint: it returns oob HTML with server-rendered
      // markdown. We parse it ourselves and append any .dm-msg not already shown.
      function pokePoll() {
        if (poking) { pokeQueued = true; return; }
        poking = true;
        fetch('/api/dms/' + encodeURIComponent(other) + '/messages?since=' + lastId(), {
          headers: { 'hx-request': 'true' },
        }).then(function (r) { return r.text(); }).then(function (t) {
          if (t) {
            var tmp = document.createElement('div');
            tmp.innerHTML = t;
            var added = false;
            var items = document.getElementById('dm-items') || thread;
            tmp.querySelectorAll('.dm-msg[data-id]').forEach(function (el) {
              var id = el.dataset.id;
              if (!thread.querySelector('.dm-msg[data-id="' + id + '"]')) {
                items.appendChild(el); added = true;
              }
            });
            if (added) thread.scrollTop = thread.scrollHeight;
          }
        }).catch(function () {}).then(function () { 
          poking = false; 
          if (pokeQueued) { pokeQueued = false; pokePoll(); }
        });
      }

      function showTyping(on) {
        if (!typingEl) return;
        if (on) {
          typingEl.style.display = '';
          if (statusText) statusText.style.display = 'none';
          if (typingHideTimer) clearTimeout(typingHideTimer);
          typingHideTimer = setTimeout(function () { showTyping(false); }, 5000);
        } else {
          typingEl.style.display = 'none';
          if (statusText) statusText.style.display = '';
        }
      }

      function sendTyping(on) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(JSON.stringify({ type: 'typing', on: !!on })); } catch (e) {}
      }
      function onInputTyping() {
        var now = Date.now();
        if (!amTyping || now - lastTypingSent > 2000) { amTyping = true; lastTypingSent = now; sendTyping(true); }
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(stopTyping, 3000);
      }
      function stopTyping() {
        if (typingIdleTimer) { clearTimeout(typingIdleTimer); typingIdleTimer = null; }
        if (amTyping) { amTyping = false; sendTyping(false); }
      }

      function startKeepalive() {
        stopKeepalive();
        kaTimer = setInterval(function () { if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 30000);
      }
      function stopKeepalive() { if (kaTimer) { clearInterval(kaTimer); kaTimer = null; } }

      function connect() {
        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '/chat/ws?dm=' + encodeURIComponent(other));
        ws.onopen = function () { retries = 0; startKeepalive(); pokePoll(); };
        ws.onmessage = function (ev) {
          if (ev.data === 'pong') return;
          var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
          if (d.type === 'message') { pokePoll(); }
          else if (d.type === 'typing') { showTyping(!!d.on); }
        };
        ws.onclose = function () { stopKeepalive(); scheduleReconnect(); };
        ws.onerror = function () { try { ws.close(); } catch (e) {} };
      }
      function scheduleReconnect() {
        retries++;
        if (retries > 6) return; // give up; 20s HTMX poll remains as fallback
        setTimeout(connect, Math.min(1000 * Math.pow(2, retries), 15000));
      }

      // Intercept compose: when WS is open, send over it and suppress the htmx
      // POST. Capture-phase + stopImmediatePropagation so htmx's own submit
      // listener never fires (avoids a double-submit that nukes .main). When WS
      // is closed, do nothing -> htmx hx-post="/dms" proceeds unchanged.
      if (form) {
        form.addEventListener('submit', function (e) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return; // fallback: let htmx run
          var val = ta ? ta.value.trim() : '';
          e.preventDefault();
          e.stopImmediatePropagation();
          if (val.length < 1 || val.length > 4000) return;
          try { ws.send(JSON.stringify({ type: 'send', content: val })); } catch (err) { return; }
          if (ta) ta.value = '';
          stopTyping();
        }, true);
      }
      if (ta) {
        ta.addEventListener('input', function () {
          if (!ta.value.trim()) stopTyping(); else onInputTyping();
        });
      }

      connect();
    })();`;

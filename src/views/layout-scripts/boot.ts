// Byte-identical slice of the layout.ts inline <script> block: initial
// localize/nav-state calls, DM-unread sync, htmx:afterSwap re-init, window
// load boot (register form, turnstile, heartbeat timer, SW registration +
// push heal), same-page anchor scroll, Ctrl+Enter reply submit.
// syncDmUnread mutates markup rendered by views/dms.ts and layout-shell.ts.
export const SCRIPT_BOOT = `

      updateRelativeTimes();
      updateActiveStates();
      document.body.classList.toggle('fab-hidden', !!document.querySelector('.post-wrap'));

      function syncDmUnread() {
        var dmBadgeContainer = document.getElementById('dm-nav-badge-container');
        var dmBtn = document.getElementById('dm-nav-btn');
        if (dmBadgeContainer && dmBtn) {
          dmBtn.classList.toggle('has-unread', dmBadgeContainer.children.length > 0);
        }
      }
      document.body.addEventListener('htmx:afterSwap', function(evt) {
        updateRelativeTimes();
        updateActiveStates();
        if (window.location.hash) handleSmoothScroll(window.location.hash.substring(1));
        syncDmUnread();
        initRegisterForm(evt.target);
        initTurnstile(evt.target);
        // Compose is a normal .main page now (not a fullscreen modal that
        // hid the FAB as a side effect) - hide just the FAB while it's open
        // so "new topic" doesn't float over the new-topic form.
        document.body.classList.toggle('fab-hidden', !!document.querySelector('.post-wrap'));
      });
      // htmx:afterSwap does NOT fire on back/forward - htmx restores the
      // cached snapshot (including body.fab-hidden as it was at push time)
      // via htmx:historyRestore instead. Without this, navigating back from
      // /post leaves the FAB permanently hidden until the next real swap.
      document.body.addEventListener('htmx:historyRestore', function() {
        document.body.classList.toggle('fab-hidden', !!document.querySelector('.post-wrap'));
      });
      // The heartbeat updates badges via out-of-band swaps - those fire
      // htmx:oobAfterSwap, not htmx:afterSwap - so sync the DM button here too.
      document.body.addEventListener('htmx:oobAfterSwap', syncDmUnread);
      
      window.addEventListener('load', function() {
        initRegisterForm(document);
        initTurnstile(document);
        if (window.location.hash) setTimeout(() => handleSmoothScroll(window.location.hash.substring(1)), 300);

        // Visibility-gated heartbeat: one poll drives every nav badge + presence.
        // It fires only while the tab is visible - hidden, minimized and
        // forgotten-open tabs stop polling entirely. Web push covers DMs that
        // arrive while the tab is closed.
        var hbEl = document.getElementById('heartbeat');
        if (hbEl) {
          var HEARTBEAT_MS = 60000;
          var hbTimer = null;
          var beat = function() {
            if (document.visibilityState === 'visible') hbEl.dispatchEvent(new CustomEvent('beat'));
          };
          var startBeat = function() {
            if (hbTimer) clearInterval(hbTimer);
            hbTimer = setInterval(beat, HEARTBEAT_MS);
          };
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') { beat(); startBeat(); }
            else if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
          });
          beat();
          startBeat();
        }

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW register failed:', err));

          // Heal a stale subscription whenever a DM page is present - on the
          // initial load AND after any HTMX swap that brings #dm-push-btn into
          // the DOM (most users reach /dms via HTMX, not a full reload, so a
          // load-only trigger would never fire for them). The button carries the
          // current VAPID key in data-vapid-key.
          var healPush = function () {
            var pushBtn = document.getElementById('dm-push-btn');
            if (!pushBtn) return;
            if (Notification.permission === 'granted') {
              var lbl = pushBtn.querySelector('.dm-push-label');
              if (lbl) lbl.textContent = 'Notifications Enabled';
              else pushBtn.textContent = 'Notifications Enabled';
              pushBtn.disabled = true;
              pushBtn.setAttribute('title', 'Notifications enabled');
              pushBtn.setAttribute('aria-label', 'Notifications enabled');
              ensureFreshSubscription(pushBtn.dataset.vapidKey);
            }
          };
          healPush();
          document.body.addEventListener('htmx:afterSettle', healPush);
        }
      });
      
      document.body.addEventListener('click', function(e) {
        const a = e.target.closest('a');
        if (a && a.hash && a.pathname === window.location.pathname) {
          e.preventDefault();
          history.pushState(null, null, a.hash);
          handleSmoothScroll(a.hash.substring(1));
        }
      });

      document.body.addEventListener('keydown', function(e) {
        if (!e.target.matches('#reply-content')) return;
        var ta = e.target;
        // Plain Enter falls through to the default newline; Ctrl/Cmd+Enter submits.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (ta.value.trim()) ta.closest('form').requestSubmit();
        }
      });`;

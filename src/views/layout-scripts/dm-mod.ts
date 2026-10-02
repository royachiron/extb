// Byte-identical slice of the layout.ts inline <script> block: admin confirm
// modal, warning-reply confirm, DM poll `since` param + send cooldown + thread
// scroll management, /mod/deleted tab + archive/warn modals, CW blur reveal.
// The dm-thread since param is the D1-quota guard (see md-db-developer rule
// dm-polling-since-param) - do not alter.
export const SCRIPT_DM_MOD = `
      // Admin modal
      window.confirmAction = function(title, body, confirmBtnText, onConfirm) {
        var modal = document.getElementById('admin-modal');
        if (!modal) return;
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = body;
        var btn = document.getElementById('modal-confirm');
        btn.textContent = confirmBtnText;
        btn.onclick = function() { onConfirm(); modal.style.display = 'none'; };
        modal.style.display = 'flex';
      };
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var modal = document.getElementById('admin-modal');
        if (modal) modal.style.display = 'none';
        var drawer = document.getElementById('add-room-drawer');
        if (drawer) drawer.style.display = 'none';
      });

      // Warning reply: confirm before submit
      document.body.addEventListener('click', function(e) {
        var btn = e.target;
        if (!btn || !btn.matches) return;
        if (btn.matches('[data-warning-reply-confirm]')) {
          var form = btn.closest('[data-warning-reply-form]');
          if (!form) return;
          var ta = form.querySelector('textarea[name="content"]');
          if (!ta || !ta.value.trim()) { ta && ta.focus(); return; }
          var prompt = form.querySelector('[data-warning-reply-confirm-prompt]');
          if (prompt) { prompt.style.display = 'block'; btn.style.display = 'none'; }
        }
        if (btn.matches('[data-warning-reply-cancel]')) {
          var form = btn.closest('[data-warning-reply-form]');
          if (!form) return;
          var prompt = form.querySelector('[data-warning-reply-confirm-prompt]');
          var confirmBtn = form.querySelector('[data-warning-reply-confirm]');
          if (prompt) prompt.style.display = 'none';
          if (confirmBtn) confirmBtn.style.display = '';
        }
      });

      // DM: add 'since' param to poll requests to prevent duplicates
      document.body.addEventListener('htmx:configRequest', function(evt) {
        var elt = evt.detail.elt;
        if (!elt || elt.id !== 'dm-thread') return;
        var last = elt.querySelector('[data-id]:last-child');
        evt.detail.parameters['since'] = last ? last.dataset.id : '0';
      });

      // DM: send button loading state
      document.body.addEventListener('htmx:beforeRequest', function(evt) {
        var form = evt.detail.elt;
        if (!form || !form.classList || !form.classList.contains('dm-compose-wrap')) return;
        var btn = form.querySelector('.dm-send-pill');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var svg = btn.querySelector('svg');
        if (svg) svg.style.display = 'none';
        var label = document.createElement('span');
        label.className = 'dm-send-countdown';
        label.style.cssText = 'font-size:13px;font-weight:800;color:#fff;line-height:1;';
        label.textContent = '1';
        btn.appendChild(label);
        var n = 1;
        var iv = setInterval(function() {
          n--;
          if (n <= 0) {
            clearInterval(iv);
            btn.disabled = false;
            label.remove();
            if (svg) svg.style.display = '';
          } else {
            label.textContent = String(n);
          }
        }, 1000);
      });

      // DM: thread scroll management.
      // Force scroll-to-bottom ONLY on a fresh thread render (initial open / own-send
      // re-renders .main) and on poll appends when the user was already at the bottom.
      // A stray unconditional scroll on every global htmx:afterSwap was yanking the view
      // to the bottom while users scrolled up to read history.
      var dmWasNearBottom = true;
      function dmIsNearBottom(el) {
        return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      }
      function initDmTextarea() {
        var ta = document.getElementById('dm-textarea');
        if (!ta || ta.dataset.dmInit) return;
        ta.dataset.dmInit = '1';
        ta.focus();
        ta.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        ta.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
            e.preventDefault();
            var form = ta.closest('form');
            if (form && ta.value.trim()) htmx.trigger(form, 'submit');
          } else if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
            e.preventDefault();
            var pos = ta.selectionStart;
            ta.value = ta.value.slice(0, pos) + '\\n' + ta.value.slice(pos);
            ta.selectionStart = ta.selectionEnd = pos + 1;
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
          }
        });
      }
      // Fresh thread element (no dmReady flag): scroll to bottom once, wire textarea.
      // Existing thread: no-op, so unrelated swaps never disturb scroll position.
      function initDmThread() {
        var t = document.getElementById('dm-thread');
        if (!t || t.dataset.dmReady) return;
        t.dataset.dmReady = '1';
        t.scrollTop = t.scrollHeight;
        dmWasNearBottom = true;
        initDmTextarea();
      }
      // Capture position BEFORE a poll append mutates scrollHeight.
      function dmCaptureScroll(evt) {
        var t = evt && evt.detail && evt.detail.target;
        if (t && t.id === 'dm-thread' && t.dataset.dmReady) {
          dmWasNearBottom = dmIsNearBottom(t);
        }
      }
      // After a poll append, only follow to the bottom if the user was already there.
      function dmAfterAppend(evt) {
        var t = evt && evt.detail && evt.detail.target;
        if (t && t.id === 'dm-thread' && t.dataset.dmReady && dmWasNearBottom) {
          t.scrollTop = t.scrollHeight;
        }
      }
      document.body.addEventListener('htmx:beforeSwap', dmCaptureScroll);
      document.body.addEventListener('htmx:oobBeforeSwap', dmCaptureScroll);
      document.body.addEventListener('htmx:afterSwap', function(evt) {
        initDmThread();
      });
      document.body.addEventListener('htmx:oobAfterSwap', dmAfterAppend);
      initDmThread();

      // /mod/deleted: tab filtering + archive modal (event delegation survives HTMX swaps)
      document.body.addEventListener('click', function(e) {
        // Tab switch
        var tab = e.target.closest('[data-del-tab]');
        if (tab) {
          var which = tab.getAttribute('data-del-tab');
          document.querySelectorAll('.del-tab').forEach(function(t) {
            t.classList.toggle('active', t === tab);
          });
          document.querySelectorAll('[data-del-state]').forEach(function(item) {
            var show = which === 'all' || item.getAttribute('data-del-state') === which;
            item.style.display = show ? '' : 'none';
          });
          document.querySelectorAll('[data-del-empty]').forEach(function(empty) {
            empty.style.display = empty.getAttribute('data-del-empty') === which ? '' : 'none';
          });
          return;
        }
        // Archive modal: open
        var opener = e.target.closest('[data-archive-open]');
        if (opener) {
          var overlay = document.getElementById('archive-modal-' + opener.getAttribute('data-archive-open'));
          if (overlay) overlay.style.display = 'flex';
          return;
        }
        // Archive modal: close via Cancel button
        var closer = e.target.closest('[data-archive-close]');
        if (closer) {
          var ov = document.getElementById('archive-modal-' + closer.getAttribute('data-archive-close'));
          if (ov) ov.style.display = 'none';
          return;
        }
        // Archive modal: close when clicking the backdrop itself (not the inner card)
        var backdrop = e.target.closest('[data-archive-modal]');
        if (backdrop && e.target === backdrop) {
          backdrop.style.display = 'none';
          return;
        }
        // Warn modal: open
        var warnOpener = e.target.closest('[data-warn-open]');
        if (warnOpener) {
          var warnOverlay = document.getElementById('warn-modal-' + warnOpener.getAttribute('data-warn-open'));
          if (warnOverlay) warnOverlay.style.display = 'flex';
          return;
        }
        // Warn modal: close via Cancel button
        var warnCloser = e.target.closest('[data-warn-close]');
        if (warnCloser) {
          var warnOv = document.getElementById('warn-modal-' + warnCloser.getAttribute('data-warn-close'));
          if (warnOv) warnOv.style.display = 'none';
          return;
        }
        // Warn modal: close when clicking the backdrop itself (not the inner card)
        var warnBackdrop = e.target.closest('[data-warn-modal]');
        if (warnBackdrop && e.target === warnBackdrop) {
          warnBackdrop.style.display = 'none';
        }
        // CW blur reveal - whole overlay is clickable, not just the button
        var cwBtn = e.target.closest && e.target.closest('.cw-blur-overlay');
        if (cwBtn) {
          var cwWrap = cwBtn.closest('.cw-blur-wrap');
          if (cwWrap) {
            cwWrap.classList.add('revealed');
            var cwId = cwWrap.getAttribute('data-cw-id');
            if (cwId) localStorage.setItem('cw-revealed-' + cwId, '1');
          }
          return;
        }
      });
      // Restore previously revealed CW blurs from localStorage
      (function applyCwRevealed() {
        document.querySelectorAll('.cw-blur-wrap[data-cw-id]').forEach(function (el) {
          var id = el.getAttribute('data-cw-id');
          if (localStorage.getItem('cw-revealed-' + id) === '1') el.classList.add('revealed');
        });
      })();
      document.addEventListener('htmx:afterSwap', function () {
        document.querySelectorAll('.cw-blur-wrap[data-cw-id]').forEach(function (el) {
          var id = el.getAttribute('data-cw-id');
          if (localStorage.getItem('cw-revealed-' + id) === '1') el.classList.add('revealed');
        });
      });`;

// Byte-identical slice of the layout.ts inline <script> block: TOS-modal
// escape key, theme + font-size toggles, sidebar drawer, active-nav states,
// relative-time localizer, smooth scroll, toasts, copy-link, thread collapse,
// delete panels, [data-confirm]. See layout-scripts/index.ts for ordering.
export const SCRIPT_UI = `
      document.addEventListener('click', function(event) {
        var link = event.target.closest && event.target.closest('a[data-language]');
        if (!link) return;
        var language = link.getAttribute('data-language');
        if (language !== 'he' && language !== 'en') return;
        var target = new URL(window.location.href);
        target.searchParams.set('lang', language);
        link.href = target.href;
      });

      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('form[action="/register"] #tos-modal.open').forEach(function(overlay) {
          overlay.classList.remove('open');
          overlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        });
      });

      // Theme
      var darkBtn = document.getElementById('dark-mode-toggle');
      function updateTheme(dark) {
        document.body.classList.toggle('dark-mode', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        darkBtn.innerHTML = dark 
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      }
      darkBtn.onclick = function() { updateTheme(!document.body.classList.contains('dark-mode')); };
      try {
        var storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'dark') {
          updateTheme(true);
        } else if (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          // OS preference as default only - apply class without persisting so an
          // explicit toggle (which persists via updateTheme) still wins later.
          document.body.classList.add('dark-mode');
          darkBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
        }
      } catch(e) {}

      // Text size preference
      var fontBtn = document.getElementById('font-size-toggle');
      var FONT_SIZES = ['m', 'l', 's'];
      function applyFontSize(size) {
        document.body.classList.remove('font-s', 'font-l');
        if (size === 's' || size === 'l') document.body.classList.add('font-' + size);
      }
      if (fontBtn) {
        fontBtn.onclick = function() {
          var cur = 'm';
          try { cur = localStorage.getItem('fontSize') || 'm'; } catch(e) {}
          var next = FONT_SIZES[(FONT_SIZES.indexOf(cur) + 1) % FONT_SIZES.length];
          applyFontSize(next);
          try { localStorage.setItem('fontSize', next); } catch(e) {}
        };
      }
      try { applyFontSize(localStorage.getItem('fontSize') || 'm'); } catch(e) {}
      try {
        if (window.innerWidth > 768) {
          var _saved = localStorage.getItem('sidebarCollapsed');
          if (_saved !== 'false') document.body.classList.add('sidebar-collapsed');
        }
      } catch(e) {}

      // Drawer
      window.openDrawer = function() {
        var s = document.getElementById('sidebar-drawer');
        var o = document.getElementById('drawer-overlay');
        if (s) s.classList.add('open');
        if (o) o.classList.add('open');
        document.body.style.overflow = 'hidden';
      };
      window.closeDrawer = function() {
        var s = document.getElementById('sidebar-drawer');
        var o = document.getElementById('drawer-overlay');
        if (s) s.classList.remove('open');
        if (o) o.classList.remove('open');
        document.body.style.overflow = '';
      };
      
      var _toggle = document.getElementById('drawer-toggle');
      var _close = document.getElementById('drawer-close');
      var _overlay = document.getElementById('drawer-overlay');
      
      function handleDrawer() {
        if (window.innerWidth <= 768) window.openDrawer();
        else {
          document.body.classList.add('sidebar-animating');
          document.body.classList.toggle('sidebar-collapsed');
          localStorage.setItem('sidebarCollapsed', String(document.body.classList.contains('sidebar-collapsed')));
          setTimeout(function () { document.body.classList.remove('sidebar-animating'); }, 350);
        }
      }

      if (_toggle) _toggle.addEventListener('click', handleDrawer);
      // Bottom-nav Chat/DMs navigate directly; they must NOT open the rooms drawer
      // (doing so flashed the sidebar open mid-navigation). Drawer opens via hamburger only.
      if (_close) _close.addEventListener('click', window.closeDrawer);
      if (_overlay) _overlay.addEventListener('click', window.closeDrawer);
      var _sidebar = document.getElementById('sidebar-drawer');
      if (_sidebar) _sidebar.querySelectorAll('a').forEach(function(a) { a.addEventListener('click', window.closeDrawer); });

      function updateActiveStates() {
        var path = window.location.pathname;
        
        // Sidebar: Strict matching
        document.querySelectorAll('.sidebar a').forEach(function(a) {
          a.classList.remove('active');
          var href = a.getAttribute('href');
          if (!href) return;
          var active = (href === '/') ? (path === '/') : (path.startsWith(href) && href !== '/');
          if (active) a.classList.add('active');
        });

        // Top Nav: Strict matching
        document.querySelectorAll('.topnav nav a').forEach(function(a) {
          a.classList.remove('active');
          var href = a.getAttribute('href');
          if (href && path.startsWith(href)) a.classList.add('active');
        });

        // Bottom Nav: Data-path matching
        document.querySelectorAll('.bottom-nav a, .bottom-nav button').forEach(function(a) {
          a.classList.remove('active');
          var dp = a.getAttribute('data-path');
          if (!dp) return;
          var active = (dp === '/') ? (path === '/' || path.startsWith('/r/') || path.startsWith('/t/')) : path.startsWith(dp);
          if (active) a.classList.add('active');
        });
      }

      function updateRelativeTimes() {
        document.querySelectorAll('.post-time[data-utc], .rel-time[data-utc], .chat-time[data-utc]').forEach(el => {
          if (el.dataset.localized) return;
          const utc = el.getAttribute('data-utc');
          if (!utc) return;
          const date = new Date(utc);
          if (isNaN(date.getTime())) return;
          el.textContent = date.toLocaleString(document.documentElement.lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
          el.dataset.localized = '1';
        });
      }

      function handleSmoothScroll(targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          el.classList.add('highlight-pulse');
          setTimeout(() => el.classList.remove('highlight-pulse'), 3000);
        }
      }

      document.body.addEventListener('toast', function(evt) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + (evt.detail.type || 'success');
        toast.innerHTML = '<span>' + evt.detail.message + '</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      });

      // Post UID copy-link
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-post-anchor]');
        if (!btn) return;
        var anchor = btn.dataset.postAnchor;
        var url = location.origin + location.pathname + '#' + anchor;
        var done = function() {
          btn.classList.add('copied');
          var orig = btn.textContent;
          btn.textContent = 'copied';
          setTimeout(function() { btn.classList.remove('copied'); btn.textContent = orig; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(function() {
            var ta = document.createElement('textarea');
            ta.value = url; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch(_) {}
            document.body.removeChild(ta);
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch(_) {}
          document.body.removeChild(ta);
        }
        e.preventDefault();
        e.stopPropagation();
      });

      // Thread collapse/expand toggle
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-thread-toggle]');
        if (!btn) return;
        e.preventDefault();
        var postId = btn.dataset.threadToggle;
        var wrap = document.querySelector('.thread-wrap[data-post-thread="' + postId + '"]');
        if (!wrap) return;
        var descendants = document.querySelectorAll('.thread-wrap[data-thread-ancestor~="' + postId + '"]');
        var isCollapsed = wrap.classList.toggle('thread-collapsed');
        for (var i = 0; i < descendants.length; i++) {
          descendants[i].classList.toggle('thread-hidden', isCollapsed);
        }
        btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        btn.setAttribute('title', isCollapsed ? 'Expand replies' : 'Collapse replies');
        btn.setAttribute('aria-label', isCollapsed ? 'Expand replies' : 'Collapse replies');
        if (isCollapsed) {
          btn.setAttribute('data-hidden-count', '+' + descendants.length);
        } else {
          btn.removeAttribute('data-hidden-count');
        }
      });

      // Delete expand panel toggle (replaces data-confirm)
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-delete-toggle]');
        if (!btn) return;
        var postId = btn.dataset.deleteToggle;
        var panel = document.getElementById('delete-expand-' + postId);
        if (!panel) return;
        var isOpen = panel.style.display !== 'none';
        document.querySelectorAll('[id^="delete-expand-"]').forEach(function(p) {
          p.style.display = 'none';
        });
        panel.style.display = isOpen ? 'none' : 'block';
        e.preventDefault();
        e.stopPropagation();
      });

      // Close expand panel on cancel
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-delete-cancel]');
        if (!btn) return;
        var postId = btn.dataset.deleteCancel;
        var panel = document.getElementById('delete-expand-' + postId);
        if (panel) panel.style.display = 'none';
        e.preventDefault();
      });

      // Confirm-and-submit for [data-confirm] buttons (topic delete, room archive, account delete).
      // requestSubmit() fires the submit event so the CSRF injector above runs.
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-confirm]');
        if (!btn) return;
        e.preventDefault();
        if (!window.confirm(btn.getAttribute('data-confirm') || 'Are you sure?')) return;
        var form = btn.closest('form');
        if (form) form.requestSubmit();
      });`;

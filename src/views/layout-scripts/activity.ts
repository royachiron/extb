// Idle tracking for background auto-refreshes. The feed's 60s refresh
// (views/feed.ts #topic-list) checks window.__userIdle() and stops after 10
// minutes without any input, then catches up immediately ('feed:wake') the
// moment the viewer is back. A visible-but-unattended tab (second monitor)
// otherwise keeps refreshing all day. Static string, no ${} interpolation.
export const SCRIPT_ACTIVITY = `

      (function () {
        var IDLE_MS = 600000;
        var last = Date.now();
        window.__userIdle = function () { return Date.now() - last > IDLE_MS; };
        function active() {
          var wasIdle = window.__userIdle();
          last = Date.now();
          if (!wasIdle) return;
          var tl = document.getElementById('topic-list');
          if (tl && window.htmx) window.htmx.trigger(tl, 'feed:wake');
        }
        ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(function (ev) {
          window.addEventListener(ev, active, { passive: true, capture: true });
        });
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') active();
        });
      })();
`;

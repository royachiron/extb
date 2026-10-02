// Byte-identical slice of the layout.ts inline <script> block: Web Push for
// DM notifications, incl. the stale-subscription heal after VAPID rotation.
// ensureFreshSubscription is called from the load handler in boot.ts.
export const SCRIPT_PUSH = `

      // Web Push: DM notifications toggle
      function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      }

      function applicationServerKeyMatches(sub, vapidKey) {
        try {
          var existing = sub.options && sub.options.applicationServerKey;
          if (!existing) return false;
          var a = new Uint8Array(existing);
          var b = urlBase64ToUint8Array(vapidKey);
          if (a.length !== b.length) return false;
          for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
          return true;
        } catch (_) { return false; }
      }

      function saveSubscription(sub) {
        var data = sub.toJSON();
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        var token = csrfMeta ? csrfMeta.getAttribute('content') : '';
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
          body: JSON.stringify({ endpoint: data.endpoint, keys: data.keys }),
        });
      }

      // Heal subscriptions left stale by a VAPID key rotation: if the stored
      // applicationServerKey differs from the current one (or there is no sub),
      // unsubscribe and re-subscribe under the current key, then persist it.
      function ensureFreshSubscription(vapidKey) {
        if (!vapidKey || !('PushManager' in window) || Notification.permission !== 'granted') return;
        navigator.serviceWorker.ready.then(function(reg) {
          return reg.pushManager.getSubscription().then(function(sub) {
            if (sub && applicationServerKeyMatches(sub, vapidKey)) return saveSubscription(sub);
            var unsub = sub ? sub.unsubscribe() : Promise.resolve();
            return unsub.then(function() {
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
              });
            }).then(saveSubscription);
          });
        }).catch(function(err) { console.error('ensureFreshSubscription failed:', err); });
      }

      document.body.addEventListener('click', function(e) {
        var btn = e.target.closest('#dm-push-btn');
        if (!btn) return;
        var vapidKey = btn.dataset.vapidKey;
        if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
          alert('Push notifications are not supported in this browser.');
          return;
        }
        Notification.requestPermission().then(function(perm) {
          if (perm !== 'granted') {
            alert('Notification permission denied. Enable it in browser settings.');
            return;
          }
          navigator.serviceWorker.ready.then(function(reg) {
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });
          }).then(function(sub) {
            var data = sub.toJSON();
            var csrfMeta = document.querySelector('meta[name="csrf-token"]');
            var token = csrfMeta ? csrfMeta.getAttribute('content') : '';
            return fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
              body: JSON.stringify({ endpoint: data.endpoint, keys: data.keys }),
            });
          }).then(function(res) {
            if (res && res.ok) {
              var label = btn.querySelector('.dm-push-label');
              if (label) label.textContent = 'DM Notifications Enabled';
              else btn.textContent = 'DM Notifications Enabled';
              btn.disabled = true;
              btn.setAttribute('title', 'Notifications enabled');
              btn.setAttribute('aria-label', 'Notifications enabled');
            }
          }).catch(function(err) { console.error('Push subscribe error:', err); });
        });
      });`;

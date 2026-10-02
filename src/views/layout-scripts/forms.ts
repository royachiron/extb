// Byte-identical slice of the layout.ts inline <script> block: CSRF injection
// for HTMX + plain forms, register-form TOS modal wiring, Turnstile
// explicit-render loader. See layout-scripts/index.ts for ordering rules.
export const SCRIPT_FORMS = `

      // Inject CSRF into all requests (HTMX and regular forms)
      (function() {
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (!csrfMeta) return;
        var token = csrfMeta.getAttribute('content');
        // HTMX requests
        document.body.addEventListener('htmx:configRequest', function(evt) {
          evt.detail.headers['x-csrf-token'] = token;
        });
        // Regular form submissions
        document.addEventListener('submit', function(evt) {
          var form = evt.target;
          if (!form || form.tagName !== 'FORM' || form.method === 'get') return;
          if (form.querySelector('input[name="csrf"]')) return;
          var inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = 'csrf'; inp.value = token;
          form.appendChild(inp);
        });
      })();

      function initRegisterForm(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var forms = [];
        if (scope.matches && scope.matches('form[action="/register"]')) forms.push(scope);
        scope.querySelectorAll('form[action="/register"]').forEach(function(form) {
          forms.push(form);
        });

        forms.forEach(function(form) {
          if (form.dataset.registerInit === '1') return;
          form.dataset.registerInit = '1';

          var pill = form.querySelector('#tos-pill');
          var overlay = form.querySelector('#tos-modal');
          var acceptBtn = form.querySelector('#tos-accept');
          var expandBtn = form.querySelector('#tos-expand');
          var fullBlock = form.querySelector('#tos-full');
          var closeBtn = form.querySelector('#tos-close');
          var hidden = form.querySelector('#tos-accepted-version');
          var submit = form.querySelector('#register-submit');
          var label = form.querySelector('.tos-pill-label');
          if (!pill || !overlay || !acceptBtn || !expandBtn || !fullBlock || !closeBtn || !hidden || !submit || !label) return;

          var version = pill.dataset.version || '';
          var fullSeen = false;

          function setSubmitState() {
            submit.disabled = !hidden.value;
          }
          function openModal() {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          }
          function closeModal(acceptIfSeen) {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (acceptIfSeen && fullSeen && !hidden.value) accept();
          }
          function accept() {
            if (!hidden.value) {
              hidden.value = version;
              pill.classList.add('accepted');
              label.textContent = 'Community Guidelines accepted (v' + version + ')';
            }
            setSubmitState();
            closeModal(false);
          }
          function expandFull() {
            fullBlock.classList.add('open');
            expandBtn.style.display = 'none';
            fullSeen = true;
          }

          pill.addEventListener('click', openModal);
          acceptBtn.addEventListener('click', accept);
          closeBtn.addEventListener('click', function() { closeModal(true); });
          expandBtn.addEventListener('click', expandFull);
          overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal(true);
          });
          setSubmitState();
        });
      }

      function initTurnstile(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var widgets = [];
        if (scope.matches && scope.matches('.cf-turnstile')) widgets.push(scope);
        scope.querySelectorAll('.cf-turnstile').forEach(function(widget) {
          widgets.push(widget);
        });
        widgets = widgets.filter(function(widget) {
          return widget.dataset.turnstileRendered !== '1';
        });
        if (!widgets.length) return;

        function renderWidgets() {
          if (!window.turnstile || !window.turnstile.render) return;
          widgets.forEach(function(widget) {
            if (widget.dataset.turnstileRendered === '1') return;
            try {
              window.turnstile.render(widget, {
                sitekey: widget.dataset.sitekey,
                size: widget.dataset.size || 'normal',
                theme: widget.dataset.theme || 'auto',
                appearance: widget.dataset.appearance || 'always'
              });
              widget.dataset.turnstileRendered = '1';
            } catch (err) {
              console.error('Turnstile render failed', err);
            }
          });
        }

        if (window.turnstile && window.turnstile.render) {
          renderWidgets();
          return;
        }

        var existing = document.querySelector('script[data-turnstile-loader]');
        if (existing) {
          existing.addEventListener('load', renderWidgets, { once: true });
          return;
        }

        var script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstileLoader = '1';
        script.addEventListener('load', renderWidgets, { once: true });
        document.head.appendChild(script);
      }`;

// Byte-identical slice of the layout.ts inline <script> block: lazy image
// cropper (avatar/cover), topic-tools tab toggle, engagement-bot panel
// delegation. Last slice of the single <script> block.
export const SCRIPT_CROPPER = `

      // Global Image Cropping & Upload - modal DOM and the cropperjs library
      // are both created lazily on first use (avatar/cover upload), not
      // server-rendered into every page. Keeps "Crop image / Cancel / Use
      // this crop" boilerplate text out of the raw HTML of every public page.
      var _cropper = null;
      var _cropperModalEl = null;
      var _cropperLibPromise = null;

      function ensureCropperModal() {
        if (_cropperModalEl) return _cropperModalEl;
        var modal = document.createElement('div');
        modal.id = 'cropper-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center;';
        var inner = document.createElement('div');
        inner.style.cssText = 'background:var(--card-bg);border-radius:16px;padding:20px;max-width:90vw;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 50px rgba(0,0,0,0.4);';
        inner.innerHTML = '<h3 style="margin:0;font-size:18px;font-weight:800;">Crop image</h3>' +
          '<div style="width:80vw;height:65vh;overflow:hidden;position:relative;background:#000;">' +
          '<img id="cropper-target" style="display:block;max-width:100%;max-height:100%;"></div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" id="cropper-cancel" class="btn btn-secondary btn-sm">Cancel</button>' +
          '<button type="button" id="cropper-confirm" class="btn btn-sm">Use this crop</button></div>';
        modal.appendChild(inner);
        document.body.appendChild(modal);
        _cropperModalEl = modal;
        return modal;
      }

      function ensureCropperLib() {
        if (window.Cropper) return Promise.resolve();
        if (_cropperLibPromise) return _cropperLibPromise;
        _cropperLibPromise = new Promise(function(resolve, reject) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css';
          document.head.appendChild(link);
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js';
          script.onload = function() { resolve(); };
          script.onerror = function() { reject(new Error('Could not load image cropper')); };
          document.head.appendChild(script);
        });
        return _cropperLibPromise;
      }

      function openCropper(file, aspect, outW, outH, onBlob) {
        ensureCropperLib().then(function() {
          var modal = ensureCropperModal();
          var reader = new FileReader();
          reader.onload = function(e) {
            var img = document.getElementById('cropper-target');
            modal.style.display = 'flex';

            if (_cropper) { _cropper.destroy(); _cropper = null; }

            img.onload = function() {
              _cropper = new Cropper(img, {
                aspectRatio: aspect,
                viewMode: 1,
                autoCropArea: 0.9,
                background: false,
                movable: true,
                zoomable: true,
                rotatable: false,
                scalable: false,
              });
            };
            img.src = e.target.result;

            var cleanup = function() {
              if (_cropper) { _cropper.destroy(); _cropper = null; }
              img.src = '';
              modal.style.display = 'none';
              document.getElementById('cropper-cancel').onclick = null;
              document.getElementById('cropper-confirm').onclick = null;
            };

            document.getElementById('cropper-cancel').onclick = cleanup;
            document.getElementById('cropper-confirm').onclick = function() {
              if (!_cropper) return;
              var canvas = _cropper.getCroppedCanvas({
                width: outW, height: outH,
                imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
              });
              canvas.toBlob(function(blob) {
                cleanup();
                if (blob) onBlob(blob);
              }, 'image/webp', 0.9);
            };
          };
          reader.readAsDataURL(file);
        }).catch(function(err) { alert(err.message); });
      }

      async function uploadBlob(blob, filename) {
        var fd = new FormData();
        fd.append('file', blob, filename);
        var csrf = document.querySelector('meta[name="csrf-token"]').content;
        var res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'x-csrf-token': csrf },
          body: fd,
        });
        if (!res.ok) throw new Error(await res.text());
        var data = await res.json();
        return data.url;
      }

      function pickFile(onFile) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = function(e) { 
          var f = e.target.files[0]; 
          if (f) onFile(f); 
          document.body.removeChild(input);
        };
        input.click();
      }

      window.triggerAvatarUpload = function() {
        pickFile(function(file) {
          openCropper(file, 1, 256, 256, async function(blob) {
            try {
              var url = await uploadBlob(blob, 'avatar.webp');
              document.getElementById('avatar_url_input').value = url;
              var wrap = document.getElementById('avatar-preview-wrap');
              if (wrap) wrap.innerHTML = '<img src="' + url + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.15);">';
            } catch (err) { alert('Upload failed: ' + err.message); }
          });
        });
      };

      window.triggerCoverUpload = function() {
        pickFile(function(file) {
          openCropper(file, 3, 1500, 500, async function(blob) {
            try {
              var url = await uploadBlob(blob, 'cover.webp');
              document.getElementById('cover_image_input').value = url;
              var wrap = document.getElementById('cover-preview-wrap');
              if (wrap) wrap.style.backgroundImage = "url('" + url + "')";
            } catch (err) { alert('Upload failed: ' + err.message); }
          });
        });
      };

      // Mod/owner tab toggle on topic page
      document.body.addEventListener('click', function(e) {
        var tab = e.target.closest('.topic-tools-tab');
        if (!tab) return;
        var panelId = tab.getAttribute('data-panel');
        var container = tab.closest('.topic-tools-tabs').parentElement;
        container.querySelectorAll('.topic-tools-tab').forEach(function(t) {
          t.classList.remove('active');
          t.style.background = '';
          t.style.color = '';
          t.style.borderColor = '';
        });
        container.querySelectorAll('.topic-tools-panel').forEach(function(p) { p.style.display = 'none'; });
        tab.classList.add('active');
        tab.style.background = 'var(--primary)';
        tab.style.color = '#fff';
        tab.style.borderColor = 'var(--primary)';
        var panel = document.getElementById(panelId);
        if (panel) panel.style.display = '';
      });

      // Engagement bot: [data-bot-branch] swaps the nearest .bot-panel with the
      // requested dialogue node; [data-bot-copy] copies the adjacent template.
      // Delegated here so it works in chat-inserted panels and HTMX-swapped pages.
      document.body.addEventListener('click', function(e) {
        if (!e.target.closest) return;
        var copyBtn = e.target.closest('[data-bot-copy]');
        if (copyBtn) {
          var pre = copyBtn.parentElement ? copyBtn.parentElement.querySelector('.bot-template') : null;
          if (pre && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pre.textContent).then(function() {
              copyBtn.textContent = 'Copied';
              setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
            }).catch(function() {});
          }
          return;
        }
        var branchBtn = e.target.closest('[data-bot-branch]');
        if (!branchBtn) return;
        var botPanel = branchBtn.closest('.bot-panel');
        if (!botPanel) return;
        var variant = botPanel.getAttribute('data-variant') || 'chat';
        fetch('/bot/panel?branch=' + encodeURIComponent(branchBtn.getAttribute('data-bot-branch')) + '&v=' + variant, { headers: { 'hx-request': 'true' } })
          .then(function(r) { return r.ok ? r.text() : ''; })
          .then(function(t) {
            if (!t) return;
            var parent = botPanel.parentElement;
            botPanel.outerHTML = t;
            // outerHTML replacement bypasses htmx's own swap path, so any
            // hx-get/hx-target on the new panel (e.g. "Start a post") is inert
            // until htmx is told to scan it.
            var fresh = parent ? parent.querySelector('.bot-panel') : null;
            if (fresh && window.htmx) window.htmx.process(fresh);
          })
          .catch(function() {});
      });`;

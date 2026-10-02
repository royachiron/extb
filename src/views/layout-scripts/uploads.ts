// Byte-identical slice of the layout.ts inline <script> block: markdown
// composer helpers + image upload/paste/drop, compression, HEIC conversion.
// Concatenated by layout-scripts/index.ts in the original order - do not
// reformat, reindent, or split into its own <script> tag (CSP + ordering +
// layout-script-syntax test all assume ONE script block).
export const SCRIPT_UPLOADS = `
      function insertMd(id, before, after) {
        var ta = document.getElementById(id);
        if (!ta) return;
        var start = ta.selectionStart, end = ta.selectionEnd;
        var selected = ta.value.substring(start, end);
        if (before === '[' && after === '](url)' && !/[\\s()]/.test(selected)) {
          try {
            var selectedUrl = new URL(selected);
            if (selectedUrl.protocol === 'http:' || selectedUrl.protocol === 'https:') {
              after = '](' + selected + ')';
            }
          } catch (_) {}
        }
        ta.value = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + selected.length;
        ta.focus();
      }

      function togglePreview(contentId, previewId) {
        var ta = document.getElementById(contentId);
        var preview = document.getElementById(previewId);
        if (!ta || !preview) return;
        var showing = preview.style.display !== 'none';
        preview.style.display = showing ? 'none' : 'block';
        ta.style.display = showing ? 'block' : 'none';
        var requestId = String((parseInt(preview.dataset.previewRequest || '0', 10) || 0) + 1);
        preview.dataset.previewRequest = requestId;
        if (showing) return;

        preview.textContent = 'Loading preview…';
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        fetch('/api/render', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfMeta ? csrfMeta.content : '',
          },
          body: JSON.stringify({ content: ta.value }),
        }).then(function(response) {
          if (response.redirected) throw new Error('Preview request redirected');
          if (!response.ok) throw new Error('Preview request failed');
          return response.text();
        }).then(function(html) {
          if (preview.dataset.previewRequest === requestId) preview.innerHTML = html;
        }).catch(function() {
          if (preview.dataset.previewRequest === requestId) {
            preview.textContent = 'Preview unavailable. Close and reopen the preview to try again.';
          }
        });
      }

      function getUploadButtons(id) {
        var buttons = document.querySelectorAll('button[onclick]');
        var matches = [];
        for (var i = 0; i < buttons.length; i++) {
          var handler = buttons[i].getAttribute('onclick') || '';
          if (handler.indexOf("triggerUpload('" + id + "')") !== -1
            || handler.indexOf('triggerUpload("' + id + '")') !== -1) matches.push(buttons[i]);
        }
        return matches;
      }

      function getUploadComposer(target) {
        if (!target || !target.matches || !target.matches('textarea[id]')) return null;
        return getUploadButtons(target.id).length ? target : null;
      }

      function isTransferImageFile(file) {
        if (!file) return false;
        var name = (file.name || '').toLowerCase();
        return (file.type || '').toLowerCase().indexOf('image/') === 0
          || name.endsWith('.heic') || name.endsWith('.heif');
      }

      function getTransferImageFiles(transfer) {
        if (!transfer || !transfer.files) return [];
        var files = Array.from(transfer.files).filter(isTransferImageFile);
        if (files.length || !transfer.items) return files;
        return Array.from(transfer.items).map(function(item) {
          return item.kind === 'file' ? item.getAsFile() : null;
        }).filter(isTransferImageFile);
      }

      function hasTransferImage(transfer) {
        if (!transfer) return false;
        if (transfer.files && Array.from(transfer.files).some(isTransferImageFile)) return true;
        if (!transfer.items) return false;
        // Protected drag data can hide a HEIC file's name and MIME type until drop.
        // Allow file drags here; the drop handler still applies the image-only filter.
        return Array.from(transfer.items).some(function(item) {
          return item.kind === 'file';
        });
      }

      async function uploadImageFile(id, file) {
        const textarea = document.getElementById(id);
        const buttons = getUploadButtons(id);
        if (!textarea || !buttons.length || !isTransferImageFile(file)) return;
        const buttonStates = buttons.map(function(btn) {
          return { btn: btn, html: btn.innerHTML, disabled: btn.disabled };
        });
        buttons.forEach(function(btn) {
          btn.innerHTML = '⌛';
          btn.disabled = true;
        });
        textarea.classList.add('image-transfer-busy');
        textarea.setAttribute('aria-busy', 'true');
        try {
          const n = (file.name || '').toLowerCase();
          const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
            || n.endsWith('.heic') || n.endsWith('.heif');
          let compressed;
          try {
            // Native path: iOS Safari / iOS Chrome decode HEIC into <canvas>
            // directly, so this works without the converter for most phones.
            compressed = await compressImage(file);
          } catch (decodeErr) {
            // Browser could not decode it (HEIC on Chrome/Firefox/Android).
            // Convert HEIC -> JPEG via heic2any, then recompress.
            if (!isHeic) throw decodeErr;
            buttons.forEach(function(btn) { btn.innerHTML = '🖼️'; });
            const jpeg = await heicToJpeg(file);
            compressed = await compressImage(jpeg);
          }
          const ext = compressed.type === 'image/webp' ? 'webp' : 'jpg';
          const fd = new FormData();
          fd.append('file', compressed, 'upload.' + ext);
          var csrfMeta = document.querySelector('meta[name="csrf-token"]');
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'x-csrf-token': csrfMeta ? csrfMeta.content : '' },
            body: fd
          });
          if (!res.ok) throw new Error(await res.text());
          const { url } = await res.json();
          insertMd(id, '![Image](' + url + ')', '');
        } catch (err) {
          alert('Upload failed: ' + (err && err.message ? err.message : err));
        } finally {
          textarea.classList.remove('image-transfer-busy');
          textarea.removeAttribute('aria-busy');
          buttonStates.forEach(function(state) {
            state.btn.innerHTML = state.html;
            state.btn.disabled = state.disabled;
          });
        }
      }

      var imageUploadQueues = {};
      function queueImageUpload(id, file) {
        var previous = imageUploadQueues[id] || Promise.resolve();
        var queued = previous.catch(function() {}).then(function() {
          return uploadImageFile(id, file);
        });
        imageUploadQueues[id] = queued;
        var cleanup = function() {
          if (imageUploadQueues[id] === queued) delete imageUploadQueues[id];
        };
        queued.then(cleanup, cleanup);
        return queued;
      }

      async function triggerUpload(id) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.heic,.heif';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (file) await queueImageUpload(id, file);
        };
        input.click();
      }

      document.body.addEventListener('paste', async function(evt) {
        var textarea = getUploadComposer(evt.target);
        if (!textarea) return;
        var files = getTransferImageFiles(evt.clipboardData);
        if (!files.length) return;
        evt.preventDefault();
        for (var i = 0; i < files.length; i++) {
          await queueImageUpload(textarea.id, files[i]);
        }
      });

      document.body.addEventListener('dragover', function(evt) {
        var textarea = getUploadComposer(evt.target);
        if (!textarea) return;
        if (!hasTransferImage(evt.dataTransfer)) return;
        evt.preventDefault();
        textarea.classList.add('image-transfer-drag');
      });

      document.body.addEventListener('dragleave', function(evt) {
        var textarea = getUploadComposer(evt.target);
        if (textarea) textarea.classList.remove('image-transfer-drag');
      });

      document.body.addEventListener('drop', async function(evt) {
        var textarea = getUploadComposer(evt.target);
        if (!textarea) return;
        var files = getTransferImageFiles(evt.dataTransfer);
        textarea.classList.remove('image-transfer-drag');
        if (!files.length) return;
        evt.preventDefault();
        for (var i = 0; i < files.length; i++) {
          await queueImageUpload(textarea.id, files[i]);
        }
      });

      // Resize to <=1600px and encode. Prefers WebP; falls back to JPEG when
      // the browser cannot encode WebP (older Safari returns null). Rejects on
      // unreadable/undecodable input instead of hanging forever.
      function compressImage(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Could not read the file.'));
          reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Could not decode this image. If it is an iPhone HEIC photo, it will be converted automatically - otherwise try saving it as JPEG or PNG.'));
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let w = img.width, h = img.height;
              const max = 1600;
              if (w > max || h > max) {
                if (w > h) { h = (h / w) * max; w = max; }
                else { w = (w / h) * max; h = max; }
              }
              canvas.width = w; canvas.height = h;
              const cx = canvas.getContext('2d');
              cx.drawImage(img, 0, 0, w, h);
              canvas.toBlob((blob) => {
                if (blob) { resolve(blob); return; }
                // WebP unsupported on this browser - fall back to JPEG.
                canvas.toBlob((j) => j ? resolve(j) : reject(new Error('Could not encode the image.')), 'image/jpeg', 0.85);
              }, 'image/webp', 0.85);
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      // Lazy-load heic2any (allowed by CSP script-src: cdn.jsdelivr.net) only
      // when a HEIC/HEIF file actually needs converting.
      var _heicLib;
      function loadHeic() {
        if (_heicLib) return _heicLib;
        _heicLib = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
          s.onload = () => resolve(window.heic2any);
          s.onerror = () => reject(new Error('Could not load the HEIC converter.'));
          document.head.appendChild(s);
        });
        return _heicLib;
      }

      async function heicToJpeg(file) {
        const heic2any = await loadHeic();
        const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        return Array.isArray(out) ? out[0] : out;
      }`;

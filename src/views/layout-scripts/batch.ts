// Byte-identical slice of the layout.ts inline <script> block: topic batch
// moderation mode. The batch-toggle/batch-bar/batch-count ids and the
// window.enterBatchMode/submitBatchAction globals are rendered by
// views/topic.ts - keep names and ids in sync. See layout-scripts/index.ts.
export const SCRIPT_BATCH = `

      function enterBatchMode() {
        document.querySelectorAll('.post-card:not(.op-card)').forEach(function(card) {
          card.classList.add('batch-selectable');
        });
        var bar = document.getElementById('batch-bar');
        if (bar) bar.style.display = 'flex';
        var toggle = document.getElementById('batch-toggle');
        if (toggle) toggle.style.display = 'none';
        updateBatchCount();
      }

      function exitBatchMode() {
        document.querySelectorAll('.post-card.batch-selected').forEach(function(card) {
          card.classList.remove('batch-selected');
        });
        document.querySelectorAll('.post-card').forEach(function(card) {
          card.classList.remove('batch-selectable');
        });
        var bar = document.getElementById('batch-bar');
        if (bar) bar.style.display = 'none';
        var toggle = document.getElementById('batch-toggle');
        if (toggle) toggle.style.display = '';
        updateBatchCount();
      }

      function updateBatchCount() {
        var count = document.querySelectorAll('.post-card.batch-selected').length;
        var el = document.getElementById('batch-count');
        if (el) el.textContent = count + ' selected';
      }

      function submitBatchAction(topicId, action) {
        var selected = document.querySelectorAll('.post-card.batch-selected');
        if (!selected.length) return;
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '/t/' + topicId + '/posts/batch-delete';
        var actionInput = document.createElement('input');
        actionInput.name = 'action';
        actionInput.value = action;
        form.appendChild(actionInput);
        selected.forEach(function(card) {
          var inp = document.createElement('input');
          inp.name = 'ids';
          inp.value = card.dataset.postId;
          form.appendChild(inp);
        });
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfMeta) {
          var csrfInput = document.createElement('input');
          csrfInput.name = 'csrf';
          csrfInput.value = csrfMeta.getAttribute('content');
          form.appendChild(csrfInput);
        }
        document.body.appendChild(form);
        form.submit();
      }

      // Card click for batch selection
      document.addEventListener('click', function(e) {
        var card = e.target.closest('.post-card.batch-selectable');
        if (!card) return;
        if (e.target.closest('button, a, input, [data-delete-toggle]')) return;
        card.classList.toggle('batch-selected');
        updateBatchCount();
      });

      window.enterBatchMode = enterBatchMode;
      window.exitBatchMode = exitBatchMode;
      window.submitBatchAction = submitBatchAction;`;

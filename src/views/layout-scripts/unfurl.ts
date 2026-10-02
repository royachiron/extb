// Byte-identical slice of the layout.ts inline <script> block: link unfurl
// cards. NOTE the double-escaped regexes (\\\\/ and \\\\s emit \\/ and \\s in the
// browser) - template-literal escape rules, do not "fix" them.
export const SCRIPT_UNFURL = `

      function unfurlLinks() {
        var urlRegex = /(https?:\\/\\/[^\\s<>"]+)/g;
        var processed = {};
        document.querySelectorAll('.post-body, .dm-msg, .dm-markdown, .topic-body, .news-body, .qa-body, .blog-body').forEach(function(el) {
          if (el.dataset.unfurled) return;
          el.dataset.unfurled = '1';
          var html = el.innerHTML;
          var urls = [];
          var match;
          while ((match = urlRegex.exec(html)) !== null) {
            var url = match[1];
            if (!processed[url] && url.length < 2000) {
              urls.push(url);
              processed[url] = true;
            }
          }
          if (urls.length === 0) return;
          urls.slice(0, 3).forEach(function(url) {
            fetch('/api/unfurl?url=' + encodeURIComponent(url))
              .then(r => r.json())
              .then(data => {
                if (!data.card) return;
                var decoded = url.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
                var anchors = el.querySelectorAll('a');
                var anchor = null;
                for (var i = 0; i < anchors.length; i++) {
                  var h = anchors[i].getAttribute('href') || '';
                  if (h === url || h === decoded || anchors[i].href === url || anchors[i].href === decoded) { anchor = anchors[i]; break; }
                }
                var target = anchor ? anchor.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, div') : null;
                if (target && el.contains(target) && target !== el) {
                  target.insertAdjacentHTML('afterend', data.card);
                } else {
                  el.insertAdjacentHTML('beforeend', data.card);
                }
              })
              .catch(() => {});
          });
        });
      }
      unfurlLinks();
      document.body.addEventListener('htmx:afterSettle', unfurlLinks);`;

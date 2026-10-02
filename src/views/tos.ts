import { esc } from './layout-utils';
import { DEFAULT_BRANDING, type Branding } from '../lib/branding';
export const CURRENT_TOS_VERSION = 1;
export const TOS_LAST_UPDATED = '2026-10-02';
export const TOS_TLDR = [{ title: 'Respect each other', body: 'No harassment, hate, spam, or illegal content.' }, { title: 'Protect privacy', body: 'Share only information you have permission to share.' }, { title: 'Moderation', body: 'Moderators can remove content and restrict access. Report issues through the community tools.' }];
const CHAPTERS = [{ id: 's1', num: 1, label: 'Community rules' }, { id: 's2', num: 2, label: 'Your account and content' }];
export function renderTosBody(branding: Branding = DEFAULT_BRANDING): string { return `<section id="s1" class="tos-section"><h2><!--extb-ui-->Community rules<!--/extb-ui--></h2><p style="white-space:pre-wrap">${esc(branding.rules)}</p></section><section id="s2" class="tos-section"><h2><!--extb-ui-->Your account and content<!--/extb-ui--></h2><p><!--extb-ui-->You remain responsible for your contributions. Do not post material you have no right to share. Keep your password private. Community administrators may moderate content and restrict accounts to enforce these rules.<!--/extb-ui--></p><p><!--extb-ui-->This installation is operated by its community owner. Contact your community administrators for privacy, account, or moderation questions.<!--/extb-ui--></p>${branding.contact_email ? `<p><a href="mailto:${esc(branding.contact_email)}">${esc(branding.contact_email)}</a></p>` : ''}</section>`; }

const TOS_PAGE_CSS = `
<style>
  .tos-wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
  .tos-head { margin: 24px 0 32px; }
  .tos-head h1 { font-size: 28px; font-weight: 800; margin: 0 0 8px; }
  .tos-head .tos-meta { font-size: 13px; color: var(--text-muted); }
  .tos-grid { display: grid; grid-template-columns: 240px 1fr; gap: 40px; align-items: start; }
  .tos-toc { position: sticky; top: 80px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; }
  .tos-toc h3 { font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px; letter-spacing: 0.05em; font-weight: 700; }
  .tos-toc ol { list-style: none; counter-reset: tocnum; margin: 0; padding: 0; }
  .tos-toc li { counter-increment: tocnum; margin-bottom: 4px; }
  .tos-toc a { display: block; padding: 8px 10px; border-radius: 6px; color: var(--text-main); text-decoration: none; font-size: 14px; font-weight: 500; }
  .tos-toc a::before { content: counter(tocnum) ". "; color: var(--text-muted); font-weight: 700; margin-right: 4px; }
  .tos-toc a:hover { background: var(--bg-color); color: var(--primary); }
  .tos-tldr-block { margin: 0 0 32px; padding: 20px 22px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; }
  .tos-tldr-block h2 { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
  .tos-tldr-block .tos-tldr-sub { margin: 0 0 14px; font-size: 13px; color: var(--text-muted); }
  .tos-tldr-block ul { list-style: none; padding: 0; margin: 0; }
  .tos-tldr-block li { padding: 12px 14px; margin-bottom: 8px; background: var(--bg-color); border-radius: 8px; border-left: 3px solid var(--primary); }
  .tos-tldr-block li:last-child { margin-bottom: 0; }
  .tos-tldr-block li strong { display: block; margin-bottom: 4px; }
  .tos-tldr-block li span { color: var(--text-main); line-height: 1.55; font-size: 14px; }
  .tos-body { min-width: 0; }
  .tos-section { margin-bottom: 40px; scroll-margin-top: 100px; }
  .tos-section h2 { font-size: 22px; font-weight: 800; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
  .tos-section p { line-height: 1.65; margin: 0 0 12px; color: var(--text-main); }
  .tos-section ul { margin: 0 0 14px; padding-left: 22px; line-height: 1.65; }
  .tos-section li { margin-bottom: 6px; }
  .tos-section a { color: var(--primary); }
  .founders-note { margin: 24px 0; padding: 16px 18px; background: var(--bg-color); border-left: 3px solid var(--primary); border-radius: 8px; color: var(--text-main); }
  .founders-note p { margin: 0 0 8px; line-height: 1.6; }
  .founders-note p:last-child { margin-bottom: 0; }
  .founders-sig { font-weight: 700; margin-top: 8px !important; }
  @media (max-width: 800px) {
    .tos-grid { grid-template-columns: 1fr; gap: 16px; }
    .tos-toc { position: static; }
  }
</style>
`;

export function renderTosPage(branding: Branding = DEFAULT_BRANDING): string {
  const toc = CHAPTERS.map(c => `<li><a href="#${c.id}"><!--extb-ui-->${c.label}<!--/extb-ui--></a></li>`).join('');
  return `
    ${TOS_PAGE_CSS}
    <div class="tos-wrap">
      <div class="tos-head">
        <h1><!--extb-ui-->Community Guidelines &amp; Terms of Use<!--/extb-ui--></h1>
        <div class="tos-meta"><!--extb-ui-->Last updated:<!--/extb-ui--> ${TOS_LAST_UPDATED} · <!--extb-ui-->Version<!--/extb-ui--> ${CURRENT_TOS_VERSION}</div>
      </div>
      <div class="tos-grid">
        <aside class="tos-toc">
          <h3><!--extb-ui-->Contents<!--/extb-ui--></h3>
          <ol>${toc}</ol>
        </aside>
        <div class="tos-body">
          <section class="tos-tldr-block" aria-labelledby="tos-tldr-heading">
            <h2 id="tos-tldr-heading"><!--extb-ui-->TL;DR<!--/extb-ui--></h2>
            <p class="tos-tldr-sub"><!--extb-ui-->The short version &mdash; the full text below is what governs.<!--/extb-ui--></p>
            <ul>
              ${TOS_TLDR.map(p => `<li><strong><!--extb-ui-->${p.title}<!--/extb-ui--></strong><span><!--extb-ui-->${p.body}<!--/extb-ui--></span></li>`).join('')}
            </ul>
          </section>
          ${renderTosBody(branding)}
        </div>
      </div>
    </div>
    <script>
      (function() {
        var TOPBAR_OFFSET = 80;
        document.querySelectorAll('.tos-toc a').forEach(function(a) {
          a.addEventListener('click', function(e) {
            var href = a.getAttribute('href') || '';
            if (href.charAt(0) !== '#') return;
            var id = href.substring(1);
            var el = document.getElementById(id);
            if (!el) return;
            e.preventDefault();
            e.stopPropagation();
            var top = el.getBoundingClientRect().top + window.pageYOffset - TOPBAR_OFFSET;
            window.scrollTo({ top: top, behavior: 'smooth' });
            try { history.pushState(null, '', '#' + id); } catch (_) {}
          }, true);
        });
        // On initial load with hash, scroll with offset.
        if (window.location.hash) {
          var id = window.location.hash.substring(1);
          var el = document.getElementById(id);
          if (el) {
            setTimeout(function() {
              var top = el.getBoundingClientRect().top + window.pageYOffset - TOPBAR_OFFSET;
              window.scrollTo({ top: top, behavior: 'auto' });
            }, 50);
          }
        }
      })();
    </script>
  `;
}

const TOS_MODAL_CSS = `
<style>
  .tos-pill { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; border-radius: 10px; background: var(--bg-color); border: 1.5px dashed var(--border-color); color: var(--text-main); cursor: pointer; font-size: 14px; font-weight: 600; text-align: left; transition: all 0.15s; }
  .tos-pill:hover { border-color: var(--primary); }
  .tos-pill.accepted { border-style: solid; border-color: #10b981; background: rgba(16, 185, 129, 0.08); }
  .tos-pill-icon { font-size: 20px; line-height: 1; flex-shrink: 0; }
  .tos-pill-label { flex: 1; }
  .tos-pill-arrow { color: var(--text-muted); font-weight: 700; }
  .tos-pill.accepted .tos-pill-icon::before { content: '✓'; }
  .tos-pill.accepted .tos-pill-arrow::before { content: '✎'; }

  .tos-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10000; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; }
  .tos-modal-overlay.open { display: flex; }
  .tos-modal-card { background: var(--card-bg); color: var(--text-main); border-radius: 14px; max-width: 640px; width: 100%; padding: 24px 24px 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); position: relative; }
  .tos-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; background: none; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; border-radius: 8px; }
  .tos-modal-close:hover { background: var(--bg-color); }
  .tos-modal-title { margin: 0 0 6px; font-size: 22px; font-weight: 800; }
  .tos-modal-sub { margin: 0 0 18px; font-size: 13px; color: var(--text-muted); }
  .tos-tldr-list { list-style: none; padding: 0; margin: 0 0 18px; }
  .tos-tldr-list li { padding: 12px 14px; margin-bottom: 8px; background: var(--bg-color); border-radius: 8px; border-left: 3px solid var(--primary); }
  .tos-tldr-list li strong { display: block; margin-bottom: 4px; }
  .tos-tldr-list li span { color: var(--text-main); line-height: 1.55; font-size: 14px; }
  .tos-modal-expand { background: none; border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 14px; width: 100%; margin-bottom: 16px; }
  .tos-modal-expand:hover { border-color: var(--primary); color: var(--primary); }
  .tos-modal-full { display: none; max-height: 360px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px; background: var(--bg-color); }
  .tos-modal-full.open { display: block; }
  .tos-modal-full .tos-section { margin-bottom: 24px; }
  .tos-modal-full .tos-section:last-child { margin-bottom: 0; }
  .tos-modal-full h2 { font-size: 16px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); }
  .tos-modal-full p, .tos-modal-full li { font-size: 13px; line-height: 1.55; }
  .tos-modal-full ul { padding-left: 20px; margin: 0 0 10px; }
  .tos-modal-full a { color: var(--primary); }
  .tos-modal-full .founders-note { font-size: 13px; }
  .tos-modal-accept { width: 100%; padding: 12px; font-size: 15px; font-weight: 700; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; }
  .tos-modal-accept:hover { filter: brightness(1.05); }
</style>
`;

// intentionally distinct from layout-utils esc: does NOT escape single quotes,
// so merging would change rendered attribute bytes.
function escAttr(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TOS_BANNER_CSS = `
<style>
  .tos-banner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 18px; margin: 0 0 20px; background: rgba(99, 102, 241, 0.08); border: 1px solid var(--primary); border-radius: 12px; color: var(--text-main); }
  .tos-banner-text { flex: 1; min-width: 200px; font-size: 14px; line-height: 1.5; }
  .tos-banner-text strong { display: block; margin-bottom: 2px; }
  .tos-banner-cta { padding: 9px 16px; background: var(--primary); color: white; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
  .tos-banner-cta:hover { filter: brightness(1.05); }
</style>
`;

export function renderTosBanner(opts: { csrfToken: string; branding?: Branding }): string {
  return `
    ${TOS_BANNER_CSS}
    ${TOS_MODAL_CSS}
    <div class="tos-banner" id="tosb-banner">
      <div class="tos-banner-text">
        <strong><!--extb-ui-->The Community Guidelines have been updated.<!--/extb-ui--></strong>
        <span><!--extb-ui-->Please review and acknowledge to continue participating.<!--/extb-ui--></span>
      </div>
      <button type="button" id="tosb-cta" class="tos-banner-cta"><!--extb-ui-->Review &amp; accept<!--/extb-ui--></button>
    </div>

    <div id="tosb-modal" class="tos-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="tosb-modal-title" aria-hidden="true">
      <div class="tos-modal-card">
        <button type="button" class="tos-modal-close" id="tosb-close" aria-label="Close">✕</button>
        <h2 id="tosb-modal-title" class="tos-modal-title"><!--extb-ui-->Community Guidelines - TL;DR<!--/extb-ui--></h2>
        <p class="tos-modal-sub">Version ${CURRENT_TOS_VERSION} · Last updated ${TOS_LAST_UPDATED}</p>
        <ul class="tos-tldr-list">
          ${TOS_TLDR.map(p => `<li><strong><!--extb-ui-->${p.title}<!--/extb-ui--></strong><span><!--extb-ui-->${p.body}<!--/extb-ui--></span></li>`).join('')}
        </ul>
        <button type="button" id="tosb-expand" class="tos-modal-expand"><!--extb-ui-->Read full guidelines ▾<!--/extb-ui--></button>
        <div id="tosb-full" class="tos-modal-full">
          ${renderTosBody(opts.branding)}
        </div>
        <form method="post" action="/tos/accept" id="tosb-form" style="margin:0;">
          <input type="hidden" name="csrf" value="${escAttr(opts.csrfToken)}">
          <input type="hidden" name="tos_accepted_version" value="${CURRENT_TOS_VERSION}">
          <input type="hidden" name="return_to" id="tosb-return-to" value="/">
          <button type="submit" class="tos-modal-accept"><!--extb-ui-->I understand &mdash; accept and continue<!--/extb-ui--></button>
        </form>
      </div>
    </div>

    <script>
      (function() {
        var banner = document.getElementById('tosb-banner');
        var cta = document.getElementById('tosb-cta');
        var overlay = document.getElementById('tosb-modal');
        var closeBtn = document.getElementById('tosb-close');
        var expandBtn = document.getElementById('tosb-expand');
        var fullBlock = document.getElementById('tosb-full');
        var form = document.getElementById('tosb-form');
        var returnInput = document.getElementById('tosb-return-to');
        if (form && returnInput) {
          form.addEventListener('submit', function() {
            returnInput.value = window.location.pathname + window.location.search;
          });
        }

        function openModal() {
          overlay.classList.add('open');
          overlay.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
        }
        function closeModal() {
          overlay.classList.remove('open');
          overlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
        function expandFull() {
          fullBlock.classList.add('open');
          expandBtn.style.display = 'none';
        }
        cta.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        expandBtn.addEventListener('click', expandFull);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
        });
      })();
    </script>
  `;
}

export function renderTosPill(): string {
  return `
    ${TOS_MODAL_CSS}
    <input type="hidden" id="tos-accepted-version" name="tos_accepted_version" value="">
    <button type="button" id="tos-pill" class="tos-pill" data-version="${CURRENT_TOS_VERSION}" aria-haspopup="dialog" aria-controls="tos-modal">
      <span class="tos-pill-icon">📜</span>
      <span class="tos-pill-label"><!--extb-ui-->Read and accept the Community Guidelines<!--/extb-ui--></span>
      <span class="tos-pill-arrow">›</span>
    </button>

    <div id="tos-modal" class="tos-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="tos-modal-title" aria-hidden="true">
      <div class="tos-modal-card">
        <button type="button" class="tos-modal-close" id="tos-close" aria-label="Close">✕</button>
        <h2 id="tos-modal-title" class="tos-modal-title"><!--extb-ui-->Community Guidelines - TL;DR<!--/extb-ui--></h2>
        <p class="tos-modal-sub">Version ${CURRENT_TOS_VERSION} · Last updated ${TOS_LAST_UPDATED}</p>
        <ul class="tos-tldr-list">
          ${TOS_TLDR.map(p => `<li><strong><!--extb-ui-->${p.title}<!--/extb-ui--></strong><span><!--extb-ui-->${p.body}<!--/extb-ui--></span></li>`).join('')}
        </ul>
        <button type="button" id="tos-expand" class="tos-modal-expand"><!--extb-ui-->Read full guidelines ▾<!--/extb-ui--></button>
        <div id="tos-full" class="tos-modal-full">
          ${renderTosBody()}
        </div>
        <button type="button" id="tos-accept" class="tos-modal-accept"><!--extb-ui-->I understand - accept and continue<!--/extb-ui--></button>
      </div>
    </div>

  `;
}

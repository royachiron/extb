// Safe markdown -> HTML renderer.
//
// Built on marked v18 with three security overrides:
//   1. `html()` renderer returns '' - strips ALL raw HTML (block via
//      Tokens.HTML, inline via Tokens.Tag). User-supplied <script>, <iframe>,
//      <svg>, <style>, <img onerror=>, broken-tag tricks all get dropped
//      before reaching output.
//   2. `link()` renderer validates href: only relative paths, http(s), and
//      mailto. Everything else (javascript:, data:, vbscript:, encoded
//      variants the URL parser refuses) becomes '#'.
//   3. `image()` renderer validates src: only relative paths and http(s).
//      Refuses data: URIs (data:text/html,<script>...> XSS vector).
//
// Marked v18 default-escapes text content (`<`/`>`/`&`/`"`/`'`) inside text
// nodes, so attacker-controlled text can never reach the DOM as markup. The
// only attacker-controlled bytes that emerge as markup are URL strings, and
// those run through the validators above.
//
// Uses `new Marked()` (instance, not the global `marked`) so this config is
// isolated from any other marked imports in the app or test deps.

import { Marked } from 'marked';
// Same escape set/output as the old local escapeAttr (order differs but & is
// first in both, so output is identical). layout-utils is runtime-import-free.
import { esc as escapeAttr } from '../views/layout-utils';

function safeUrl(href: string | null | undefined): string {
  if (!href) return '#';
  const trimmed = String(href).trim();
  if (!trimmed) return '#';
  // Same-origin relative paths and fragments are safe.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      return trimmed;
    }
  } catch {
    /* malformed URL */
  }
  return '#';
}

function safeImageUrl(href: string | null | undefined): string {
  if (!href) return '';
  const trimmed = String(href).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  } catch {
    /* malformed URL */
  }
  return '';
}

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Strip raw HTML. Both block (Tokens.HTML) and inline (Tokens.Tag) route here.
    html(): string {
      return '';
    },
    link({ href, title, tokens }: any): string {
      const visibleUrl = tokens?.length === 1 && tokens[0]?.type === 'text'
        ? tokens[0].text
        : undefined;
      const safe = String(href).trim().toLowerCase() === 'url'
        ? safeUrl(visibleUrl)
        : safeUrl(href);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      // parseInline on link content -- inline html tokens get stripped by
      // the html() override above.
      // @ts-ignore -- `this.parser` exists at runtime in renderer scope.
      const text = (this as any).parser.parseInline(tokens);
      const isExternal = !safe.startsWith('/') && !safe.startsWith('#');
      const rel = isExternal ? ' rel="noopener noreferrer nofollow"' : '';
      return `<a href="${escapeAttr(safe)}"${titleAttr}${rel}>${text}</a>`;
    },
    image({ href, title, text }: any): string {
      const safe = safeImageUrl(href);
      if (!safe) return '';
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      const altAttr = ` alt="${escapeAttr(text || '')}"`;
      return `<img src="${escapeAttr(safe)}"${altAttr}${titleAttr} loading="lazy">`;
    },
  },
});

export function renderMarkdown(content: string): string {
  if (!content) return '';
  return md.parse(content) as string;
}

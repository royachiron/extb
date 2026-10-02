// Small, pure presentation utilities extracted from layout.ts so they can be
// imported (and unit-tested) without dragging in the whole page-shell monolith.
// layout.ts re-exports these (`export * from './layout-utils'`) so the ~13
// existing `from './layout'` importers - and the profile.ts initials re-export
// chain - keep working unchanged. Keep this module's top level free of runtime
// imports from './layout' (it must not depend back on the monolith).
import type { Room } from '../types';

export function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON.stringify() never escapes "<", so a literal "</script>" in string
// content (e.g. a user-supplied post title) can close an embedding
// <script type="application/ld+json"> block early and inject live markup.
// Apply at every jsonLd embed site.
export function escJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c');
}

// Relative-time span for a D1 "YYYY-MM-DD HH:MM:SS" timestamp; the client
// localizer (updateRelativeTimes in layout.ts) rewrites the label from data-utc.
// Byte-identical to the former private timeTag helpers in mod.ts/profile.ts.
// Other rel-time emitters (dms fmtTime, feed relTime, inline profile spans)
// differ in escaping or T-handling - do not fold them in without a byte check.
export function timeTag(raw: string): string {
  return `<span class="rel-time" data-utc="${esc(raw.replace(' ', 'T') + 'Z')}">${esc(raw)}</span>`;
}

export function csrfField(ctx: { csrfToken?: string }): string {
  if (!ctx.csrfToken) return '';
  return `<input type="hidden" name="csrf" value="${esc(ctx.csrfToken)}">`;
}

// Cursor-paginated load-more control. The wrapper id doubles as the hx-target:
// the partial handler swaps this div (outerHTML) with a fresh control and
// OOB-appends the next page elsewhere. A null href renders the exhausted form -
// the bare div must stay so the swap target still exists.
//
// NOT used by renderFeedMore (feed.ts): that control carries an extra
// hx-on::after-request attribute and multi-line attribute formatting, so it
// cannot share this markup byte-identically. Converging it needs sign-off.
export function loadMoreButton(p: { id: string; href: string | null; label: string }): string {
  const { id, href, label } = p;
  if (!href) return `<div id="${id}"></div>`;
  return `<div id="${id}" style="margin:16px 0;text-align:center;">
    <button class="btn btn-secondary" hx-get="${href}" hx-target="#${id}" hx-swap="outerHTML">${label}</button>
  </div>`;
}

export function markdownToolbar(textareaId: string, previewId: string, opts?: { pollTargetId?: string }): string {
  return `
    <div class="md-toolbar">
      <button type="button" class="md-btn" onclick="insertMd('${textareaId}', '[', '](url)')" title="Link">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </button>
      <button type="button" class="md-btn" onclick="triggerUpload('${textareaId}')" title="Upload Image">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
      </button>
      <button type="button" class="md-btn" onclick="insertMd('${textareaId}', '- ', '')" title="List">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </button>
      <button type="button" class="md-btn" onclick="insertMd('${textareaId}', '**', '**')" title="Bold">
        <span style="font-weight:900;">B</span>
      </button>
      <button type="button" class="md-btn" onclick="insertMd('${textareaId}', '*', '*')" title="Italic">
        <span style="font-style:italic; font-family:serif; font-size:18px;">/</span>
      </button>
      <button type="button" class="md-btn" onclick="insertMd('${textareaId}', '~~', '~~')" title="Strikethrough">
        <span style="text-decoration:line-through; font-weight:700;">S</span>
      </button>
      ${opts?.pollTargetId ? `<button type="button" class="md-btn" onclick="var d=document.getElementById('${opts.pollTargetId}'); if(d){d.open=true; d.scrollIntoView({behavior:'smooth', block:'center'});}" title="Add a poll">
        <span>📊</span>
      </button>` : ''}
    </div>
    <div id="${previewId}" class="post-body" role="status" aria-live="polite" style="display:none; padding:12px; border:1px solid var(--border-color); border-radius:6px; background:var(--card-bg); margin-bottom:12px; min-height:100px;"></div>
  `;
}

export function roomIcon(room: Room): string {
  if (room.icon) return room.icon;
  const map: Record<string, string> = {
    'Amputation': '🦿',
    'SCI': '♿',
    'Blindness': '🦯',
    'Deafness': '🦻',
    'Cerebral Palsy': '🩼',
    'Incontinence': '🚽',
    'General': '💬',
    'Coping': '🌊',
    'Relationships': '🫂',
    'Pretending': '🎭',
    'Research': '🔬',
    'Off-topic': '☕',
    'Other': '🧩',
    'Blog': '📰',
    'News': '📢',
    'Questions': '❓',
    'Chat': '💬',
  };
  return map[room.name] || '•';
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function initials(name: string): string {
  if (!name) return '?';
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  const only = parts[0] ?? clean;
  if (only.length >= 2) return (only[0]! + only[1]!).toUpperCase();
  return only[0]!.toUpperCase();
}

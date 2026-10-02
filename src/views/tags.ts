import type { CwTag } from '../types';
import { esc } from './layout';

export function cwTagPills(tags: CwTag[] | undefined): string {
  if (!tags || tags.length === 0) return '';
  const items = tags.map(t =>
    `<span class="cw-pill" style="background:${esc(t.color)};" title="${esc(t.description)}">${esc(t.name)}</span>`
  ).join('');
  return `<div class="cw-pills">${items}</div>`;
}

export function tagPicker(allTags: CwTag[], selectedIds: number[], collapsible = false): string {
  const sel = new Set(selectedIds);
  const items = allTags.map(t => `
    <label class="cw-picker-item">
      <input type="checkbox" name="cw_tag_ids" value="${t.id}"${sel.has(t.id) ? ' checked' : ''}>
      <span class="cw-pill" style="background:${esc(t.color)};">${esc(t.name)}</span>
    </label>
  `).join('');
  const label = `⚠️ Content warnings <span class="cw-picker-hint">(optional - tick any that apply)</span>`;
  const grid = `<div class="cw-picker-grid">${items}</div>`;
  const style = `
    <style>
      .cw-picker { margin: 12px 0; padding: 10px 12px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px; }
      .cw-picker-label { font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
      .cw-picker-hint { font-weight: 400; color: var(--text-muted); }
      .cw-picker-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .cw-picker-item { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 0.12s; }
      .cw-picker-item:hover { background: var(--card-bg); }
      .cw-picker-item input { margin: 0; cursor: pointer; }
      .cw-picker--collapsible > summary.cw-picker-label { cursor: pointer; margin-bottom: 0; }
      .cw-picker--collapsible[open] > summary.cw-picker-label { margin-bottom: 8px; }
    </style>
  `;
  const inner = collapsible
    ? `<details class="cw-picker cw-picker--collapsible">
      <summary class="cw-picker-label">${label}</summary>
      ${grid}
    </details>`
    : `<div class="cw-picker">
      <div class="cw-picker-label">${label}</div>
      ${grid}
    </div>`;
  return `${inner}${style}`;
}

export function wrapWithCwGuard(tags: CwTag[] | undefined, bodyHtml: string, viewerShowNsfw: 0 | 1, scopeId: string): string {
  if (!tags || tags.length === 0) return bodyHtml;
  const anyNsfw = tags.some(t => t.is_nsfw === 1);
  const anySpoiler = tags.some(t => t.is_spoiler === 1);
  if (anyNsfw && viewerShowNsfw === 0) {
    return `<div class="cw-nsfw-gate">NSFW content hidden. Enable in <a href="/settings/profile">Settings → "Show NSFW"</a> to view.</div>`;
  }
  if (anySpoiler) {
    return `
      <div class="cw-blur-wrap" data-cw-id="${esc(scopeId)}">
        <div class="cw-blur-body">${bodyHtml}</div>
        <div class="cw-blur-overlay"><button type="button">Click to reveal</button></div>
      </div>
    `;
  }
  return bodyHtml;
}

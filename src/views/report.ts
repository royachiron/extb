import { esc, csrfField } from './layout';
import { REPORT_REASONS, REPORT_REASON_LABELS } from '../db/reports';
import type { ReportTargetType } from '../db/reports';

/**
 * Inline report form partial, loaded via hx-get into a per-target slot div.
 * hx-swap="outerHTML" on the form: submit replaces the form with the server's
 * confirmation / error partial. No <script>, no layout shell.
 */
export function renderReportForm(
  targetType: ReportTargetType,
  targetId: number,
  csrfToken?: string,
): string {
  const options = REPORT_REASONS.map(
    (r) => `<option value="${r}">${esc(REPORT_REASON_LABELS[r])}</option>`
  ).join('');
  return `
    <form class="card report-form" hx-post="/report" hx-swap="outerHTML" style="margin-top:8px;padding:16px;display:flex;flex-direction:column;gap:10px;max-width:480px;">
      ${csrfField({ csrfToken })}
      <input type="hidden" name="type" value="${esc(targetType)}">
      <input type="hidden" name="id" value="${targetId}">
      <label style="font-size:13px;font-weight:700;color:var(--text-main);"><!--extb-ui-->Why are you reporting this?<!--/extb-ui--></label>
      <select name="reason" required style="padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);color:var(--text-main);">
        ${options}
      </select>
      <textarea name="detail" maxlength="500" rows="3" placeholder="Anything the mods should know? (optional)" style="padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);color:var(--text-main);font:inherit;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="btn-sm" onclick="this.closest('form').remove()"><!--extb-ui-->Cancel<!--/extb-ui--></button>
        <button type="submit" class="btn btn-sm"><!--extb-ui-->Send report<!--/extb-ui--></button>
      </div>
      <p style="margin:0;font-size:12px;color:var(--text-muted);"><!--extb-ui-->Reports are private - only the mod team sees them.<!--/extb-ui--></p>
    </form>`;
}

/** Quiet confirmation / friendly error partials the form swaps into. */
export function renderReportDone(message: string): string {
  return `<div class="report-done" style="margin-top:8px;padding:10px 14px;background:var(--flash-success-bg);color:var(--flash-success-text);border-radius:8px;font-size:14px;">${esc(message)}</div>`;
}

export function renderReportNotice(message: string): string {
  return `<div class="report-done" style="margin-top:8px;padding:10px 14px;background:var(--warn-bg);color:var(--warn-text);border-radius:8px;font-size:14px;">${esc(message)}</div>`;
}

/**
 * The report trigger button + its swap slot. Shared by post, topic and
 * profile surfaces so the hx wiring stays identical everywhere.
 */
export function renderReportButton(targetType: ReportTargetType, targetId: number): string {
  return `<button type="button" class="report-icon-btn" hx-get="/report/form?type=${esc(targetType)}&id=${targetId}" hx-target="#report-slot-${esc(targetType)}-${targetId}" hx-swap="innerHTML" aria-label="Report this ${esc(targetType)}" title="Report">🚩</button>`;
}

export function renderReportSlot(targetType: ReportTargetType, targetId: number): string {
  return `<div id="report-slot-${esc(targetType)}-${targetId}"></div>`;
}

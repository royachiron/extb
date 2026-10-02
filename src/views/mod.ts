import { esc, csrfField, timeTag } from './layout';
import type { User, Room, Topic, Post, ModLog, BanAppeal, ModWarningThread } from '../types';
import type { DeletedPost, DeletedTopic, ArchivedPost } from '../db';
import { REPORT_REASON_LABELS, type ReportRow } from '../db/reports';
import { renderMarkdown } from './post';

interface ModQueueOpts {
  user: User;
  rooms: Room[];
  pendingQuestionTopics: Topic[];
  pendingQuestionPosts: Post[];
  modLogs: ModLog[];
  openAppeals: BanAppeal[];
  warnings: { total: number; unresolved: number };
  openReportCount: number;
  csrfToken?: string;
}

const MOD_STYLE = `
  <style>
    .mod-section { margin-bottom: 48px; scroll-margin-top: 100px; }
    .mod-card { margin-bottom: 16px; border-radius: 16px; overflow-wrap: anywhere; word-break: break-word; }
  </style>
`;

export function renderModQueue(opts: ModQueueOpts): string {
  const {
    pendingQuestionTopics,
    pendingQuestionPosts,
    csrfToken,
  } = opts;

  const qTopicsHtml =
    pendingQuestionTopics.length === 0
      ? `<div class="empty-state" style="padding:40px;">No pending question topics.</div>`
      : pendingQuestionTopics
          .map(
            (t) => `
        <div class="card mod-card">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;">Topic #${t.id} &middot; Room: ${esc((t as any).room_name || '-')} &middot; ${esc(t.anon_name || t.author_display_name || 'anon')} &middot; ${new Date(t.created_at).toLocaleString()}</div>
          <h3 style="margin:0 0 12px;font-size:18px;font-weight:800;">${esc(t.title)}</h3>
          <div style="margin:0 0 20px;font-size:14px;color:#374151;background:var(--bg-color);padding:16px;border-radius:12px;border:1px solid #f3f4f6;">${renderMarkdown(t.content.slice(0, 800))}</div>
          <div style="display:flex;gap:12px;">
            <form method="POST" action="/mod/questions/approve" hx-post="/mod/questions/approve" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="id" value="${t.id}">
              <button type="submit" class="btn btn-sm" style="background:#10b981;">Approve</button>
            </form>
            <form method="POST" action="/mod/questions/reject" hx-post="/mod/questions/reject" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="id" value="${t.id}">
              <button type="submit" class="btn btn-sm" style="background:#ef4444;">Reject</button>
            </form>
          </div>
        </div>`
          )
          .join('');

  const qPostsHtml =
    pendingQuestionPosts.length === 0
      ? `<div class="empty-state" style="padding:40px;">No pending question replies.</div>`
      : pendingQuestionPosts
          .map(
            (p) => `
        <div class="card mod-card">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;">Reply #${p.id} on topic <a href="/t/${p.topic_short_id}" target="_blank" style="color:var(--primary)">${esc((p as any).topic_title || `#${p.topic_id}`)}</a> &middot; ${esc(p.anon_name || (p as any).author_display_name || 'anon')} &middot; ${new Date(p.created_at).toLocaleString()}</div>
          <div style="margin:0 0 20px;font-size:14px;color:#374151;background:var(--bg-color);padding:16px;border-radius:12px;border:1px solid #f3f4f6;">${renderMarkdown(p.content.slice(0, 800))}</div>
          <div style="display:flex;gap:12px;">
            <form method="POST" action="/mod/questions/post/approve" hx-post="/mod/questions/post/approve" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="id" value="${p.id}">
              <button type="submit" class="btn btn-sm" style="background:#10b981;">Approve</button>
            </form>
            <form method="POST" action="/mod/questions/post/reject" hx-post="/mod/questions/post/reject" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="id" value="${p.id}">
              <button type="submit" class="btn btn-sm" style="background:#ef4444;">Reject</button>
            </form>
          </div>
        </div>`
          )
          .join('');

  const appealsHtml = opts.openAppeals.length === 0
    ? `<div class="empty-state" style="padding:40px;">No pending ban appeals.</div>`
    : opts.openAppeals.map(a => `
        <div class="card mod-card">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;">Appeal #${a.id} &middot; by ${esc(a.user_display_name || `user#${a.user_id}`)} &middot; ${new Date(a.created_at).toLocaleString()}</div>
          <div style="margin:0 0 20px;font-size:14px;color:#374151;background:var(--bg-color);padding:16px;border-radius:12px;border:1px solid #f3f4f6;">${renderMarkdown(a.reason)}</div>
          <form method="POST" action="/mod/appeals/resolve" hx-post="/mod/appeals/resolve" hx-target="closest .card" hx-swap="outerHTML">
            ${csrfField({ csrfToken })}
            <input type="hidden" name="id" value="${a.id}">
            <div style="margin-bottom:12px;">
              <textarea name="mod_note" placeholder="Note to user (optional)..." style="width:100%;border-radius:8px;border:1px solid var(--border-color);padding:8px;font-size:14px;"></textarea>
            </div>
            <div style="display:flex;gap:12px;">
              <button type="submit" name="action" value="approve" class="btn btn-sm" style="background:#10b981;">Unban User</button>
              <button type="submit" name="action" value="reject" class="btn btn-sm" style="background:#ef4444;">Reject Appeal</button>
            </div>
          </form>
        </div>
      `).join('');

  const logsHtml = `
    <div class="card" style="padding:0;overflow-x:auto;-webkit-overflow-scrolling:touch;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">
        <thead style="background:var(--bg-color);border-bottom:1px solid #eee;">
          <tr>
            <th style="padding:12px;text-align:left;">Date</th>
            <th style="padding:12px;text-align:left;">Moderator</th>
            <th style="padding:12px;text-align:left;">Action</th>
            <th style="padding:12px;text-align:left;">Target</th>
            <th style="padding:12px;text-align:left;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${opts.modLogs.map(l => `
            <tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:12px;color:var(--text-muted);white-space:nowrap;">${new Date(l.created_at).toLocaleString()}</td>
              <td style="padding:12px;font-weight:600;">${esc(l.mod_display_name || `mod#${l.mod_id}`)}</td>
              <td style="padding:12px;"><span class="badge" style="background:#e5e7eb;color:#374151;">${esc(l.action)}</span></td>
              <td style="padding:12px;color:var(--text-muted);">${esc(l.target_type)} ${l.target_id ? `#${l.target_id}` : ''}</td>
              <td style="padding:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(l.details || '')}">${esc(l.details || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return `
    ${MOD_STYLE}
    <h1 class="page-title">Moderation Queue</h1>

    <div id="section-reports" class="mod-section">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-main);display:flex;align-items:center;gap:12px;">Reports <span class="badge badge-primary">${opts.openReportCount}</span></h2>
      <div class="card mod-card" style="padding:20px;">
        <p style="margin:0 0 14px;font-size:14px;color:var(--text-muted);">${opts.openReportCount} open member report${opts.openReportCount === 1 ? '' : 's'}. Self-harm-risk reports sort to the top.</p>
        <a href="/admin?section=moderation&tab=reports" hx-get="/admin?section=moderation&tab=reports" hx-target=".main" hx-push-url="true" class="btn btn-sm" style="text-decoration:none;display:inline-block;">Open Reports</a>
      </div>
    </div>

    <div id="section-warnings" class="mod-section">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-main);display:flex;align-items:center;gap:12px;">Warnings <span class="badge badge-primary">${opts.warnings.unresolved}</span></h2>
      <div class="card mod-card" style="padding:20px;">
        <p style="margin:0 0 14px;font-size:14px;color:var(--text-muted);">${opts.warnings.total} warning thread${opts.warnings.total === 1 ? '' : 's'} &middot; ${opts.warnings.unresolved} unresolved. The mod team shares every thread; replies reach the warned user as Boterator.</p>
        <a href="/admin?section=moderation&tab=warnings" hx-get="/admin?section=moderation&tab=warnings" hx-target=".main" hx-push-url="true" class="btn btn-sm" style="text-decoration:none;display:inline-block;">Open Warnings</a>
      </div>
    </div>

    <div id="section-questions" class="mod-section">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-main);display:flex;align-items:center;gap:12px;">Pending Questions <span class="badge badge-warn">${pendingQuestionTopics.length + pendingQuestionPosts.length}</span></h2>
      <div style="margin-bottom:32px;">
        <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;font-weight:800;">Topics</h3>
        ${qTopicsHtml}
      </div>
      <div>
        <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;font-weight:800;">Replies</h3>
        ${qPostsHtml}
      </div>
    </div>

    <div id="section-appeals" class="mod-section">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-main);display:flex;align-items:center;gap:12px;">Ban Appeals <span class="badge badge-primary">${opts.openAppeals.length}</span></h2>
      ${appealsHtml}
    </div>

    <div id="section-logs" class="mod-section">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-main);">Action Logs</h2>
      ${logsHtml}
    </div>
  `;
}

export function renderDeletedContent(
  deletedPosts: DeletedPost[],
  deletedTopics: DeletedTopic[],
  archivedPosts: ArchivedPost[],
  csrfToken: string
): string {
  // del-state for each item: 'removed' (has removed_at), 'soft' (deleted_at only), 'archived'
  const deletedPostCards = deletedPosts.map((p) => {
    const isRemoved = !!p.removed_at;
    const state = isRemoved ? 'removed' : 'soft';
    const ts = p.removed_at || p.deleted_at || p.created_at;
    const badge = isRemoved
      ? `<span class="badge badge-danger">removed</span>`
      : `<span class="badge" style="background:var(--border-color);color:var(--text-main);">soft-deleted</span>`;
    const preview = esc((p.content || '').slice(0, 200));
    return `
        <div class="card mod-card del-item" data-del-state="${state}" style="border-left:4px solid ${isRemoved ? 'var(--danger)' : 'var(--border-color)'};">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            Post #${p.id} &middot; by ${esc(p.author_name || `user#${p.user_id}`)} &middot; ${new Date(ts).toLocaleString()}
            ${badge}
          </div>
          ${p.delete_reason ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Reason: ${esc(p.delete_reason)}</div>` : ''}
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Deleted by: ${esc(p.deleted_by_name || '-')}</div>
          <div style="margin:0 0 16px;font-size:14px;color:var(--text-muted);background:var(--bg-color);padding:12px;border-radius:8px;border:1px solid var(--border-color);font-style:italic;">${preview}${(p.content || '').length > 200 ? '…' : ''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <form method="POST" action="/p/${p.id}/restore" hx-post="/p/${p.id}/restore" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <button type="submit" class="btn btn-sm" style="background:var(--success);">Restore</button>
            </form>
            <button type="button" class="btn btn-sm" style="background:var(--text-muted);" data-archive-open="${p.id}">Archive</button>
            <form method="POST" action="/p/${p.id}/delete" hx-post="/p/${p.id}/delete" hx-target="closest .card" hx-swap="outerHTML" hx-confirm="Permanently delete this post? This cannot be undone.">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="action" value="hard">
              <button type="submit" class="btn btn-sm" style="background:var(--danger);">Hard Delete</button>
            </form>
          </div>
          <div class="modal-overlay archive-modal-overlay" id="archive-modal-${p.id}" data-archive-modal="${p.id}" style="display:none;">
            <div class="modal-card archive-modal">
              <h3>Archive this deletion</h3>
              <p>Add a note for the archive record. If you tick the box, this note is also sent to the author as the warning message - they see it from Boterator.</p>
              <form method="POST" action="/p/${p.id}/archive" hx-post="/p/${p.id}/archive">
                ${csrfField({ csrfToken })}
                <textarea name="memo" rows="3" placeholder="Note / warning message…" style="margin-bottom:12px;"></textarea>
                <label class="archive-warn-row">
                  <input type="checkbox" name="send_warning" value="1">
                  <span>Send a warning to the author</span>
                </label>
                <div class="modal-actions">
                  <button type="button" class="btn-secondary" data-archive-close="${p.id}">Cancel</button>
                  <button type="submit" class="btn btn-sm" style="background:var(--text-muted);">Archive</button>
                </div>
              </form>
            </div>
          </div>
        </div>`;
  });

  const deletedTopicCards = deletedTopics.map((t) => {
    const isRemoved = !!t.removed_at;
    const state = isRemoved ? 'removed' : 'soft';
    const ts = t.removed_at || t.deleted_at || t.created_at;
    const badge = isRemoved
      ? `<span class="badge badge-danger">removed</span>`
      : `<span class="badge" style="background:var(--border-color);color:var(--text-main);">soft-deleted</span>`;
    const preview = esc(((t as any).content || t.title || '').slice(0, 200));
    return `
        <div class="card mod-card del-item" data-del-state="${state}" style="border-left:4px solid ${isRemoved ? 'var(--danger)' : 'var(--border-color)'};">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            Topic #${t.id} &middot; by ${esc(t.author_name || `user#${t.user_id}`)} &middot; ${new Date(ts).toLocaleString()}
            ${badge}
          </div>
          <h3 style="margin:0 0 8px;font-size:16px;font-weight:800;color:var(--text-main);">${esc(t.title)}</h3>
          ${t.delete_reason ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Reason: ${esc(t.delete_reason)}</div>` : ''}
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Deleted by: ${esc(t.deleted_by_name || '-')}</div>
          <div style="margin:0 0 16px;font-size:14px;color:var(--text-muted);background:var(--bg-color);padding:12px;border-radius:8px;border:1px solid var(--border-color);font-style:italic;">${preview}${((t as any).content || t.title || '').length > 200 ? '…' : ''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <form method="POST" action="/t/${t.id}/restore" hx-post="/t/${t.id}/restore" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <button type="submit" class="btn btn-sm" style="background:var(--success);">Restore</button>
            </form>
            <form method="POST" action="/t/${t.id}/delete" hx-post="/t/${t.id}/delete" hx-target="closest .card" hx-swap="outerHTML" hx-confirm="Permanently delete this topic? This cannot be undone.">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="action" value="hard">
              <button type="submit" class="btn btn-sm" style="background:var(--danger);">Hard Delete</button>
            </form>
          </div>
        </div>`;
  });

  const archivedCards = archivedPosts.map((p) => {
    const preview = esc((p.content || '').slice(0, 200));
    return `
        <div class="card mod-card del-item" data-del-state="archived" style="border-left:4px solid var(--primary);">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            Post #${p.id} &middot; by ${esc(p.author_name || `user#${p.user_id}`)} &middot; ${new Date(p.archived_at || p.created_at).toLocaleString()}
            <span class="badge" style="background:var(--highlight-bg);color:var(--primary-hover);">archived</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Archived by: ${esc(p.archived_by_name || '-')}</div>
          <div style="margin:0 0 16px;font-size:14px;color:var(--text-muted);background:var(--bg-color);padding:12px;border-radius:8px;border:1px solid var(--border-color);font-style:italic;">${preview}${(p.content || '').length > 200 ? '…' : ''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <form method="POST" action="/p/${p.id}/unarchive" hx-post="/p/${p.id}/unarchive" hx-target="closest .card" hx-swap="outerHTML">
              ${csrfField({ csrfToken })}
              <button type="submit" class="btn btn-sm" style="background:var(--success);">Unarchive</button>
            </form>
            <form method="POST" action="/p/${p.id}/delete" hx-post="/p/${p.id}/delete" hx-target="closest .card" hx-swap="outerHTML" hx-confirm="Permanently delete this post? This cannot be undone.">
              ${csrfField({ csrfToken })}
              <input type="hidden" name="action" value="hard">
              <button type="submit" class="btn btn-sm" style="background:var(--danger);">Hard Delete</button>
            </form>
          </div>
        </div>`;
  });

  const allDeleted = [...deletedPosts, ...deletedTopics];
  const softCount = allDeleted.filter((x) => !x.removed_at).length;
  const removedCount = allDeleted.filter((x) => !!x.removed_at).length;
  const archivedCount = archivedPosts.length;
  const totalCount = allDeleted.length + archivedCount;

  // Flat list: all deleted posts, deleted topics, then archived posts.
  const itemsHtml = [...deletedPostCards, ...deletedTopicCards, ...archivedCards].join('');

  // Per-tab empty states. An empty state is rendered only when that tab's
  // count is zero; its data-del-empty value must match a data-del-tab value.
  // 'all' starts visible only when everything is empty; others start hidden.
  const emptyStates = `
        ${totalCount === 0 ? `<div class="del-empty" data-del-empty="all">No deleted or archived content.</div>` : ''}
        ${softCount === 0 ? `<div class="del-empty" data-del-empty="soft" style="display:none;">No soft-deleted content.</div>` : ''}
        ${removedCount === 0 ? `<div class="del-empty" data-del-empty="removed" style="display:none;">No removed content.</div>` : ''}
        ${archivedCount === 0 ? `<div class="del-empty" data-del-empty="archived" style="display:none;">No archived content.</div>` : ''}
      `;

  const tabsRow = `
        <div class="del-tabs">
          <button type="button" class="del-tab active" data-del-tab="all">All (${totalCount})</button>
          <button type="button" class="del-tab" data-del-tab="soft">Soft-deleted (${softCount})</button>
          <button type="button" class="del-tab" data-del-tab="removed">Removed (${removedCount})</button>
          <button type="button" class="del-tab" data-del-tab="archived">Archived (${archivedCount})</button>
        </div>
      `;

  return `
    ${MOD_STYLE}
    <h1 class="page-title">Deleted Content</h1>
    ${tabsRow}
    <div class="del-list">
      ${emptyStates}
      ${itemsHtml}
    </div>
  `;
}

export function renderModWarnings(opts: {
  user: User;
  rooms: Room[];
  warnings: ModWarningThread[];
  csrfToken?: string;
}): string {
  const { warnings, csrfToken } = opts;
  const unresolved = warnings.filter((w) => !w.resolved_at).length;

  // A chat bubble. side 'left' = mod team; 'right' = the warned user.
  function bubble(side: 'left' | 'right', name: string, raw: string, bodyHtml: string): string {
    const isLeft = side === 'left';
    const radius = isLeft ? '4px 16px 16px 16px' : '16px 4px 16px 16px';
    return `
      <div style="display:flex; gap:8px; align-items:flex-start; justify-content:${isLeft ? 'flex-start' : 'flex-end'};">
        <div style="max-width:80%; min-width:0;">
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:3px; ${isLeft ? '' : 'text-align:right;'}">${esc(name)} &middot; ${timeTag(raw)}</div>
          <div style="padding:10px 14px; border-radius:${radius}; background:${isLeft ? 'var(--card-bg)' : 'var(--primary)'}; color:${isLeft ? 'var(--text-main)' : '#fff'}; border:1px solid var(--border-color); font-size:14px; white-space:pre-wrap; word-wrap:break-word;">${bodyHtml}</div>
        </div>
      </div>
    `;
  }

  function openingBody(w: ModWarningThread): string {
    const memoText = (w.internal_memo || '').trim() || '(no warning message - empty memo)';
    const tc = (w.target_content || '').trim();
    const quoted = tc ? tc.slice(0, 240) + (tc.length > 240 ? '…' : '') : '';
    return `${esc(memoText)}${quoted ? `<div style="margin-top:10px; padding:8px 12px; border-left:3px solid var(--border-color); background:var(--bg-color); color:var(--text-muted); border-radius:6px; font-size:13px; font-style:italic;">Regarding: ${esc(quoted)}</div>` : ''}`;
  }

  function thread(w: ModWarningThread): string {
    const issuer = w.mod_display_name || 'Moderator';
    const rows = [bubble('left', `${issuer} (warning issued)`, w.created_at, openingBody(w))];
    for (const r of w.replies) {
      const isWarnedUser = r.user_id === w.user_id;
      const name = isWarnedUser
        ? (r.author_display_name || w.user_display_name || `user#${w.user_id}`)
        : (r.hide_author ? 'Boterator' : (r.author_display_name || `mod#${r.user_id}`));
      rows.push(bubble(isWarnedUser ? 'right' : 'left', name, r.created_at, esc(r.content)));
    }
    return `<div style="display:flex; flex-direction:column; gap:12px; margin:16px 0;">${rows.join('')}</div>`;
  }

  function replyForm(w: ModWarningThread): string {
    if (w.resolved_at) return '';
    return `
      <form method="POST" action="/mod/warnings/${w.id}/reply" style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
        ${csrfField({ csrfToken })}
        <textarea name="content" rows="3" maxlength="1000" placeholder="Reply to this user…" required
          style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-color); color:var(--text-main); font-size:14px; resize:vertical; box-sizing:border-box;"></textarea>
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <button type="submit" class="btn btn-sm" style="padding:8px 20px; font-size:13px;">Send Reply</button>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:var(--text-muted); cursor:pointer;">
            <input type="checkbox" name="hide_author" value="1">
            <span>Post as Boterator (hide my name from the mod team)</span>
          </label>
        </div>
      </form>
    `;
  }

  function resolveForm(w: ModWarningThread): string {
    if (w.resolved_at) {
      return `<div style="margin-top:12px; padding:10px 14px; border-radius:10px; background:var(--bg-color); border:1px solid var(--border-color); font-size:13px; color:var(--text-muted);">✓ Resolved${w.resolve_memo ? ` &middot; ${esc(w.resolve_memo)}` : ''}</div>`;
    }
    return `
      <details style="margin-top:12px;">
        <summary style="cursor:pointer; font-size:13px; font-weight:700; color:var(--text-muted);">Resolve this thread</summary>
        <form method="POST" action="/api/warnings/${w.id}/resolve" hx-post="/api/warnings/${w.id}/resolve"
          style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          ${csrfField({ csrfToken })}
          <textarea name="resolve_memo" rows="2" maxlength="500" placeholder="Resolution note (optional, shown to the user)…"
            style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-color); color:var(--text-main); font-size:13px; resize:vertical; box-sizing:border-box;"></textarea>
          <div><button type="submit" class="btn btn-sm" style="padding:6px 16px; font-size:13px; background:var(--success);">Mark Resolved</button></div>
        </form>
      </details>
    `;
  }

  const cards = warnings.length === 0
    ? `<div class="empty-state" style="padding:40px;">No warnings have been issued.</div>`
    : warnings.map((w) => {
        const resolved = !!w.resolved_at;
        const statusColor = resolved ? 'var(--text-muted)' : 'var(--danger)';
        const statusText = resolved ? 'Resolved' : 'Active';
        const userName = w.user_display_name || `user#${w.user_id}`;
        const lastReply = w.replies[w.replies.length - 1];
        const awaitingMod = !resolved && !!lastReply && lastReply.user_id === w.user_id;
        return `
          <div class="card mod-card" style="border-left:4px solid ${statusColor}; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:12px; border-bottom:1px solid var(--border-color);">
              <div style="font-size:12px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">
                Warning #${w.id} &middot; <a href="/u/${encodeURIComponent(w.user_display_name || '')}" target="_blank" style="color:var(--primary);">${esc(userName)}</a> &middot; ${timeTag(w.created_at)}
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                ${awaitingMod ? `<span class="badge" style="background:var(--danger);color:#fff;">awaiting reply</span>` : ''}
                <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:${statusColor};">${statusText}</span>
              </div>
            </div>
            ${thread(w)}
            ${replyForm(w)}
            ${resolveForm(w)}
          </div>
        `;
      }).join('');

  return `
    ${MOD_STYLE}
    <h1 class="page-title">Warnings <span class="badge badge-primary">${unresolved}</span></h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">Shared moderation threads. The warned user sees every mod reply as <strong>Boterator</strong>. Tick "Post as Boterator" to also hide your name from the mod team.</p>
    ${cards}
  `;
}

export function renderModReports(opts: {
  user: User;
  rooms: Room[];
  reports: ReportRow[];
  csrfToken?: string;
}): string {
  const { reports, csrfToken } = opts;

  const targetLink = (r: ReportRow): string => {
    if (r.content_type === 'user') {
      return r.target_user_name
        ? `<a href="/u/${encodeURIComponent(r.target_user_name)}" target="_blank" style="color:var(--primary);">Profile: ${esc(r.target_user_name)}</a>`
        : `<span style="color:var(--text-muted);">user #${r.content_id} (deleted)</span>`;
    }
    if (!r.topic_short_id) return `<span style="color:var(--text-muted);">${esc(r.content_type)} #${r.content_id} (deleted)</span>`;
    const anchor = r.content_type === 'post' ? `#post-${r.content_id}` : '';
    return `<a href="/t/${esc(r.topic_short_id)}${anchor}" target="_blank" style="color:var(--primary);">${esc(r.topic_title || `topic ${r.topic_short_id}`)}</a>`;
  };

  const cards = reports.length === 0
    ? `<div class="empty-state" style="padding:40px;">No open reports. 🎉</div>`
    : reports.map((r) => {
        const selfHarm = r.reason === 'self-harm-risk';
        const reasonBadge = selfHarm
          ? `<span class="badge" style="background:var(--danger);color:#fff;">⚠ ${esc(REPORT_REASON_LABELS[r.reason] ?? r.reason)}</span>`
          : `<span class="badge badge-primary">${esc(REPORT_REASON_LABELS[r.reason] ?? r.reason)}</span>`;
        return `
        <div class="card mod-card" style="${selfHarm ? 'border-left:4px solid var(--danger);' : ''} padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">
              Report #${r.id} &middot; by <a href="/u/${encodeURIComponent(r.reporter_name || '')}" target="_blank" style="color:var(--primary);">${esc(r.reporter_name || `user#${r.reporter_id}`)}</a> &middot; ${new Date(r.created_at).toLocaleString()}
            </div>
            ${reasonBadge}
          </div>
          <div style="font-size:14px;margin-bottom:8px;">${targetLink(r)}</div>
          ${r.content_preview ? `<div style="margin:0 0 12px;font-size:14px;color:var(--text-main);background:var(--bg-color);padding:12px;border-radius:8px;border:1px solid var(--border-color);">${esc(r.content_preview)}${r.content_preview.length >= 200 ? '…' : ''}</div>` : ''}
          ${r.detail ? `<div style="margin:0 0 12px;font-size:13px;color:var(--text-muted);"><strong>Reporter says:</strong> ${esc(r.detail)}</div>` : ''}
          <form method="POST" action="/mod/reports/${r.id}/resolve" hx-post="/mod/reports/${r.id}/resolve" hx-target="closest .card" hx-swap="outerHTML" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            ${csrfField({ csrfToken })}
            <input type="text" name="note" placeholder="Note (optional)" style="flex:1;min-width:160px;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);color:var(--text-main);">
            <button type="submit" name="action" value="resolve" class="btn btn-sm">Resolve</button>
            <button type="submit" name="action" value="dismiss" class="btn btn-sm btn-secondary">Dismiss</button>
          </form>
        </div>`;
      }).join('');

  return `
    ${MOD_STYLE}
    <h1 class="page-title">Member Reports <span class="badge badge-primary">${reports.length}</span></h1>
    <p style="color:var(--text-muted); margin-bottom:24px;">Reports from members. Self-harm-risk reports sort first - treat those as urgent.</p>
    ${cards}
  `;
}

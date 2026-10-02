import { esc, initials, csrfField, markdownToolbar } from './layout';
import { badgeHtml } from './profile';
import { cwTagPills, wrapWithCwGuard, tagPicker } from './tags';
import type { CwTag, Room } from '../types';
import { renderMarkdown as renderSafeMarkdown } from '../lib/markdown';
import { renderBadgeIcon } from '../lib/badges';
import { transformVideoEmbeds } from '../lib/video-embeds';
import { renderReportButton, renderReportSlot } from './report';

export function renderMarkdown(content: string): string {
  if (!content) return '';
  const preprocessed = content.replace(
    /^(https?:\/\/\S+\.(?:gif|jpg|jpeg|png|webp|avif)(?:\?[^\s]*)?)$/gim,
    '![]($1)'
  );
  return embedLinks(renderSafeMarkdown(preprocessed));
}

export function embedLinks(html: string): string {
  // Lone image URL on its own line -> inline img
  html = html.replace(
    /<p>\s*<a href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^"]*)?)">[^<]*<\/a>\s*<\/p>/gi,
    (_, url) => `<p><img src="${url}" alt="" style="max-width:100%;border-radius:8px;display:block;" loading="lazy"></p>`,
  );

  return transformVideoEmbeds(html);
}

export function renderReactions(postId: number, reactions: any[], isTopic = false): string {
  const common = ['❤️', '🫂', '🔬', '👍', '💡', '🔥'];
  const prefix = isTopic ? 't' : 'p';
  const targetId = `reactions-${prefix}-${postId}`;

  const activeReactions = reactions.map(r => `
    <button class="reaction-btn active" 
      hx-post="/p/${postId}/react" 
      hx-vals='{"emoji": "${esc(r.emoji)}", "isTopic": ${isTopic}}' 
      hx-target="#${targetId}"
      hx-swap="outerHTML"
      title="${esc(r.users)}"
      aria-label="${esc(r.emoji)} reaction, ${r.count} - toggle"
      style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--highlight-bg);border:1px solid var(--primary-hover);border-radius:999px;font-size:13px;color:var(--primary-hover);font-weight:600;cursor:pointer;">
      <span>${esc(r.emoji)}</span>
      <span style="font-size:11px;opacity:0.8;">${r.count}</span>
    </button>
  `).join('');

  const picker = common.map(e => `
    <button class="reaction-picker-btn" 
      hx-post="/p/${postId}/react" 
      hx-vals='{"emoji": "${esc(e)}", "isTopic": ${isTopic}}' 
      hx-target="#${targetId}"
      hx-swap="outerHTML"
      aria-label="React with ${esc(e)}"
      style="background:none;border:none;padding:4px;cursor:pointer;font-size:16px;filter:grayscale(1);transition:filter 0.2s;"
      onmouseover="this.style.filter='none'"
      onmouseout="this.style.filter='grayscale(1)'">
      ${esc(e)}
    </button>
  `).join('');

  return `
    <div id="${targetId}" class="post-reactions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center;">
      ${activeReactions}
      <div class="reaction-picker" style="display:flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid var(--border-color);">
        ${picker}
      </div>
    </div>
  `;
}

export function renderPost(post: any, isOriginal: boolean, currentUser: any | null = null, opUserId: number | null = null, csrfToken: string = '', viewer?: { show_nsfw?: 0 | 1 } | null, allCwTags?: CwTag[], canReply: boolean = true): string {
  const content = renderMarkdown(post.content);
  const authorName = post.author_display_name || post.anon_name || `user${post.user_id}`;
  const initial = initials(authorName);
  const isOwner = currentUser && post.user_id === currentUser.id;
  const isMod = currentUser && ['mod', 'admin'].includes(currentUser.access_level);
  const isOP = opUserId && post.user_id === opUserId;
  const authorLink = post.user_id ? `/u/${esc(authorName)}` : null;
  // Report + Reply moved to icon rows above/beside the content (see below);
  // mod/owner actions (Edit/Delete/Warn/Edit tags) moved to the header, as
  // compact icons between the author name and the date. .post-actions now
  // only survives for the deleted/removed Restore/Remove mod controls.
  const modActionsHtml = !isOriginal && !post.deleted_at && !post.removed_at && (isOwner || isMod)
    ? `<div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
        ${(isOwner || isMod) ? `
        <button hx-get="/p/${post.id}/edit" hx-target="#post-${post.id}" hx-swap="outerHTML" class="report-icon-btn" title="Edit" aria-label="Edit this reply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>` : ''}
        ${isMod ? `
        <button type="button" class="report-icon-btn" data-delete-toggle="${post.id}" title="Delete" data-extb-i18n-title="Delete" aria-label="Delete this reply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : (isOwner ? `
        <button type="button" class="report-icon-btn" hx-post="/p/${post.id}/delete" hx-target="#post-${post.id}" hx-disabled-elt="this" hx-confirm="Delete this reply? This cannot be undone." title="Delete" data-extb-i18n-title="Delete" aria-label="Delete this reply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : '')}
        ${isMod && post.user_id && (!currentUser || post.user_id !== currentUser.id) ? `
        <button type="button" class="report-icon-btn" data-warn-open="${post.id}" title="Warn" aria-label="Warn this user">⚠️</button>` : ''}
        ${isMod ? `
        <button type="button" class="report-icon-btn" onclick="document.getElementById('cw-edit-${post.id}').showModal()" title="Edit tags" aria-label="Edit content-warning tags">🏷️</button>` : ''}
      </div>`
    : '';
  const replyBtnHtml = !isOriginal && canReply && !post.deleted_at && !post.removed_at
    ? `<button hx-get="/p/${post.id}/reply" hx-target="#post-${post.id}" hx-swap="afterend" class="action-btn" style="margin-left:auto;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg><!--extb-ui-->
        Reply
      <!--/extb-ui--></button>`
    : '';
  // Original posts never had a 'post'-type report trigger here - OP reporting
  // is a separate 'topic'-type button in topic.ts's header. Keep that split:
  // this card's post.id for isOriginal is the topic's id, not a posts-table id.
  const canReport = !isOriginal && !!(currentUser && !isOwner && !isMod && post.user_id);

  const tags = isOriginal && post.tags 
    ? `<div class="post-tags" style="margin-top: 12px;">${post.tags.split(',').map((t: string) => `<a href="/search?q=${esc(t.trim())}" hx-get="/search?q=${esc(t.trim())}" hx-target=".main" hx-push-url="true" style="display:inline-block;background:var(--bg-color);color:var(--text-main);border-radius:999px;padding:2px 8px;font-size:12px;margin-right:6px;">#${esc(t.trim())}</a>`).join('')}</div>`
    : '';

  const avatarColor = post.avatar_color || '#6366f1';

  let badgePillsInline = '';
  if (post.badges_json) {
    try {
      const arr = JSON.parse(post.badges_json);
      if (Array.isArray(arr) && arr.length) {
        const collapsed = arr;
        const haveBadges = collapsed.filter((b: any) => b.status === 'have' || !b.status);
        const needBadges = collapsed.filter((b: any) => b.status === 'need');
        
        const renderCompactBadge = (b: any) => `<span title="${esc(b.description || b.name)}" style="display:inline-flex;align-items:center;gap:4px;background:${esc(b.color)}22;color:var(--text-main);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid ${esc(b.color)}66;">${renderBadgeIcon(b.icon)} ${esc(b.name)}</span>`;
        
        const rowLabel = (t: string) => `<strong style="font-size:10px;color:var(--text-muted);text-transform:uppercase;white-space:nowrap;">${t}</strong>`;
        const badgeGroup = (t: string, badges: any[]) => badges.length
          ? `<span style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;">${rowLabel(t)}${badges.map(renderCompactBadge).join('')}</span>`
          : '';
        const haveHtml = badgeGroup('Have', haveBadges);
        const needHtml = badgeGroup('Need', needBadges);

        if (haveHtml || needHtml) {
          badgePillsInline = `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; line-height:1.3;">${haveHtml}${needHtml}</div>`;
        }
      }
    } catch {}
  }

  const reactionsHtml = renderReactions(post.id, post.reactions || [], isOriginal);
  const signatureHtml = post.signature 
    ? `<div class="post-signature" style="margin-top:20px; padding-top:12px; border-top:1px dashed var(--border-color); color:var(--text-muted); font-size:13px; line-height:1.5;">${renderMarkdown(post.signature)}</div>`
    : '';

  const depth = Math.min(Number(post.depth ?? 0), 3);
  const chainAttr: string = (post as any)._ancestorChain ?? '';

  const cardId = isOriginal ? `post-t${post.id}` : `post-${post.id}`;

  const deletedNotice = post.deleted_at
    ? `<div class="flash flash-warn" style="margin-bottom:12px;">This post was deleted: ${esc(post.delete_reason || 'No reason given')}</div>`
    : '';

  const removedNotice = post.removed_at
    ? `<div class="flash flash-warn" style="margin-bottom:12px;">Removed by moderator</div>`
    : '';

  return `
<div class="thread-wrap${isOriginal ? ' thread-root' : ''}" data-post-thread="${post.id}"${chainAttr ? ` data-thread-ancestor="${chainAttr}"` : ''}>
<div class="post-card depth-${depth}${isOriginal ? ' op-card' : ''}" id="${cardId}"${isOriginal ? '' : ` data-post-id="${post.id}"`} style="position:relative;${(post.deleted_at || post.removed_at) ? 'opacity:0.7;' : ''}">
  <div class="post-sidebar">
    ${post.avatar_url
      ? `<img src="${esc(post.avatar_url)}" class="post-avatar" style="object-fit:cover;">`
      : `<div class="post-avatar" style="background:${esc(avatarColor)}">${esc(initial)}</div>`
    }
  </div>
  <div class="post-main">
    <div class="post-header" style="align-items:flex-start;">
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
          ${!isOriginal && (post as any)._hasChildren ? `<button type="button" class="thread-collapse-btn" data-thread-toggle="${post.id}" title="Collapse replies" aria-label="Collapse replies" aria-expanded="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>` : ''}
          ${authorLink ? `<a href="${authorLink}" hx-get="${authorLink}" hx-target=".main" hx-push-url="true" class="post-author" style="font-size:15px; font-weight:800;">${esc(authorName)}</a>` : `<span class="post-author" style="font-size:15px; font-weight:800;">${esc(authorName)}</span>`}
          ${badgeHtml(post.access_level)}
          ${isOP ? '<span class="badge-op">OP</span>' : ''}
        </div>
      </div>
      ${modActionsHtml}
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
        <span class="post-time" data-utc="${post.created_at.includes('T') ? post.created_at : post.created_at.replace(' ', 'T') + 'Z'}">${new Date(post.created_at).toLocaleString()}</span>
        <button type="button" class="post-uid" data-post-anchor="${cardId}" title="Copy link to this ${isOriginal ? 'post' : 'reply'}" aria-label="Copy link">#${isOriginal ? `t${post.id}` : `p${post.id}`}</button>
        ${canReport ? renderReportButton('post', post.id) : ''}
      </div>
    </div>
    ${post.pronouns ? `
    <div style="font-size:12px; color:var(--text-main); margin-top:6px; font-weight:500;">
      ${post.pronouns ? `<span>${esc(post.pronouns)}</span>` : ''}
    </div>` : ''}
    ${badgePillsInline}
    ${cwTagPills(post.cw_tags)}
    <div class="post-body">
      ${deletedNotice}
      ${removedNotice}
      ${wrapWithCwGuard(post.cw_tags, content, (viewer?.show_nsfw ?? 0) as 0 | 1, `post-${post.id}`)}
      ${tags}
      ${signatureHtml}
      <div class="post-reactions-row" style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px;">
        ${reactionsHtml}
        ${replyBtnHtml}
      </div>
    </div>
    ${!isOriginal ? `${post.deleted_at || post.removed_at ? `
    <div class="post-actions">
      ${isMod ? `
      <button type="button" class="btn-sm" hx-post="/p/${post.id}/restore" hx-disabled-elt="this"><!--extb-ui-->Restore<!--/extb-ui--></button>` : ''}
      ${isMod && post.deleted_at && !post.removed_at ? `
      <button type="button" class="btn-sm" hx-post="/p/${post.id}/remove" hx-target="#post-${post.id}" hx-disabled-elt="this"><!--extb-ui-->Remove<!--/extb-ui--></button>` : ''}
    </div>` : ''}
    ${canReport ? renderReportSlot('post', post.id) : ''}
    ${isMod ? `
    <div id="delete-expand-${post.id}" class="delete-expand" style="display:none">
      <div class="delete-expand-inner">
        <input type="text" name="reason" placeholder="Reason (optional)" data-extb-i18n-placeholder="Reason (optional)" class="delete-reason-input" id="delete-reason-${post.id}">
        <div class="delete-expand-actions">
          <button type="button" class="btn-sm" hx-post="/p/${post.id}/delete" hx-vals='{"action":"soft"}' hx-include="#delete-reason-${post.id}" hx-target="#post-${post.id}" hx-disabled-elt="this">Soft Delete</button>
          <button type="button" class="btn-sm btn-danger" hx-post="/p/${post.id}/delete" hx-vals='{"action":"hard"}' hx-include="#delete-reason-${post.id}" hx-target="#post-${post.id}" hx-disabled-elt="this" hx-confirm="Permanently delete this post? This cannot be undone.">Hard Delete</button>
          <button type="button" class="btn-sm" hx-post="/p/${post.id}/remove" hx-include="#delete-reason-${post.id}" hx-target="#post-${post.id}" hx-disabled-elt="this"><!--extb-ui-->Remove<!--/extb-ui--></button>
          <button type="button" class="btn-sm" data-delete-cancel="${post.id}"><!--extb-ui-->Cancel<!--/extb-ui--></button>
        </div>
      </div>
    </div>` : ''}
    ${isMod && post.user_id && (!currentUser || post.user_id !== currentUser.id) ? `
    <div class="modal-overlay warn-modal-overlay" id="warn-modal-${post.id}" data-warn-modal="${post.id}">
      <div class="modal-card warn-modal">
        <h3>Warn this author</h3>
        <p>Your message is delivered to the author from Boterator. The post stays visible.</p>
        <form method="POST" action="/p/${post.id}/warn" hx-post="/p/${post.id}/warn">
          ${csrfField({ csrfToken })}
          <textarea name="memo" rows="3" required placeholder="Warning message to the author…"></textarea>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-warn-close="${post.id}"><!--extb-ui-->Cancel<!--/extb-ui--></button>
            <button type="submit" class="btn btn-sm">Send warning</button>
          </div>
        </form>
      </div>
    </div>` : ''}
    ${isMod && allCwTags ? `
    <dialog id="cw-edit-${post.id}" style="border:1px solid var(--border-color);border-radius:12px;padding:20px;max-width:520px;">
      <form method="POST" action="/content/cw-tags" hx-post="/content/cw-tags" hx-swap="none" onsubmit="setTimeout(()=>this.closest('dialog').close(),100);">
        ${csrfField({ csrfToken })}
        <input type="hidden" name="content_type" value="post">
        <input type="hidden" name="content_id" value="${post.id}">
        ${tagPicker(allCwTags, (post.cw_tags ?? []).map((t: CwTag) => t.id))}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn" style="background:#e5e7eb;color:#374151;" onclick="this.closest('dialog').close()"><!--extb-ui-->Cancel<!--/extb-ui--></button>
          <button type="submit" class="btn"><!--extb-ui-->Save<!--/extb-ui--></button>
        </div>
      </form>
    </dialog>` : ''}` : ''}
  </div>
</div>
</div>`;
}

// New-topic composers, extracted byte-identical from api/topics.ts
// (getNewTopic / getNewTopicForm). Markup unchanged.
// Shared by both composer variants below. `<details id="poll-builder">` stays
// collapsed by default - opened via the toolbar's poll button (markdownToolbar
// pollTargetId), not a summary click. Kept structurally identical to the old
// version (same field names, same collapsed-by-default behavior) so nothing
// downstream (poll submit handler) needed to change.
const POLL_BUILDER_HTML = `
      <details class="poll-builder" id="poll-builder" style="padding:8px 12px; background:var(--bg-color); border-radius:8px; border:1px solid var(--border-color);">
        <summary style="font-size:15px; font-weight:600; color:var(--text-main); cursor:pointer;"><!--extb-ui-->📊 Add a Poll <!--/extb-ui--><span style="font-size:13px; font-weight:400; color:var(--text-muted);"><!--extb-ui-->(optional)<!--/extb-ui--></span></summary>
        <label style="display:block;font-weight:600;margin:8px 0 4px;color:var(--text-main)">Question
          <input type="text" name="poll_question" style="margin-top:2px;">
        </label>
        <label style="display:block;font-weight:600;margin:8px 0 4px;color:var(--text-main)"><!--extb-ui-->Options <!--/extb-ui--><span style="font-weight:400;color:var(--text-muted)"><!--extb-ui-->(one per line, minimum 2)<!--/extb-ui--></span>
          <textarea name="poll_options" rows="3" style="margin-top:2px;" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
        </label>
        <div style="display:flex; gap:20px; margin-top:8px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:var(--text-main)">
            <input type="checkbox" name="poll_multi" value="1"> Allow multiple choice
          </label>
          <label style="display:flex; align-items:center; gap:8px; color:var(--text-main)">
            Ends at: <input type="datetime-local" name="poll_ends_at" style="width:auto;">
          </label>
        </div>
      </details>`;

function renderComposerFields(opts: {
  roomFieldHtml: string;
  prefillTitle: string;
  prefillBody: string;
  showAutoDelete: unknown;
  allCwTags: CwTag[];
}): string {
  const { roomFieldHtml, prefillTitle, prefillBody, showAutoDelete, allCwTags } = opts;
  return `
      <div class="post-body-wrap">
        ${roomFieldHtml}
        ${tagPicker(allCwTags, [], true)}
        <label class="form-label"><!--extb-ui-->Title
          <!--/extb-ui--><input type="text" name="title" class="post-title-in" required maxlength="140" placeholder="Title" data-extb-i18n-placeholder="Title" autocomplete="off" value="${esc(prefillTitle)}">
        </label>
        <label class="form-label">Body
          <textarea id="topic-content" name="content" class="post-text-in" placeholder="Body text (optional)">${esc(prefillBody)}</textarea>
        </label>
        ${showAutoDelete ? `<label style="display:flex; align-items:center; gap:8px; font-size:14px; color:var(--text-main); cursor:pointer;"><input type="checkbox" name="delete_on_approve" value="1"> Delete this introduction once I am approved general access</label>` : ''}
        ${POLL_BUILDER_HTML}
      </div>

      <div class="post-ft">
        ${markdownToolbar('topic-content', 'topic-preview', { pollTargetId: 'poll-builder' })}
        <div class="post-ft-actions">
          <button type="submit" class="btn"><!--extb-ui-->Post<!--/extb-ui--></button>
        </div>
      </div>`;
}

export function renderNewTopicComposer(opts: {
  csrfToken?: string;
  preselected: Room | null | undefined;
  postRooms: Room[];
  prefillTitle: string;
  prefillBody: string;
  showAutoDelete: unknown;
  allCwTags: CwTag[];
}): string {
  const { preselected, postRooms, prefillTitle, prefillBody, showAutoDelete, allCwTags } = opts;
  const roomFieldHtml = `
        <label class="form-label">Room
          <select name="room_id" required>
            <option value="" disabled${!preselected ? ' selected' : ''}>Select a community</option>
            ${postRooms.map(r => `<option value="${r.id}"${preselected?.id === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}
          </select>
        </label>`;
  return `
    <div class="post-wrap">
      <form method="POST" action="/topics">
        ${csrfField(opts)}
        <div class="post-hd"><h1><!--extb-ui-->New Topic<!--/extb-ui--></h1></div>
        ${renderComposerFields({ roomFieldHtml, prefillTitle, prefillBody, showAutoDelete, allCwTags })}
      </form>
    </div>`;
}

export function renderRoomTopicComposer(opts: {
  csrfToken?: string;
  room: Room;
  showAutoDelete: unknown;
  allCwTags: CwTag[];
}): string {
  const { room, showAutoDelete, allCwTags } = opts;
  const roomFieldHtml = `
        <input type="hidden" name="room_id" value="${room.id}">
        <div class="post-room-label"><!--extb-ui-->Posting in <!--/extb-ui--><strong>${esc(room.name)}</strong></div>`;
  return `
    <div class="post-wrap">
      <form method="POST" action="/topics">
        ${csrfField(opts)}
        <div class="post-hd"><h1><!--extb-ui-->New Topic<!--/extb-ui--></h1></div>
        ${renderComposerFields({ roomFieldHtml, prefillTitle: '', prefillBody: '', showAutoDelete, allCwTags })}
      </form>
    </div>`;
}

// Inline edit + quote-reply composers, extracted byte-identical from
// api/posts.ts (getEditPostForm / getReplyPostForm).
export function renderEditPostForm(opts: {
  csrfToken?: string;
  post: any;
  allCwTags: CwTag[];
  selectedIds: number[];
}): string {
  const { post, allCwTags, selectedIds } = opts;
  return `
    <form method="POST" action="/p/${post.id}/edit" hx-post="/p/${post.id}/edit" hx-target="this" hx-swap="outerHTML" class="edit-post" style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:var(--bg-color);margin-top:12px;">
      ${csrfField(opts)}
      <h1 style="margin:0 0 14px;font-size:16px;font-weight:600;"><!--extb-ui-->Edit Post<!--/extb-ui--></h1>
      ${markdownToolbar(`edit-post-${post.id}-content`, `edit-post-${post.id}-preview`)}
      <textarea id="edit-post-${post.id}-content" name="content" required rows="6" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-family:inherit;margin-bottom:12px;">${esc(post.content)}</textarea>
      ${tagPicker(allCwTags, selectedIds)}
      <div style="display:flex;gap:12px;">
        <button type="submit" class="btn"><!--extb-ui-->Save Changes<!--/extb-ui--></button>
        <button type="button" class="btn" style="background:#e5e7eb;color:#374151;" onclick="this.closest('form').remove()"><!--extb-ui-->Cancel<!--/extb-ui--></button>
      </div>
    </form>`;
}

export function renderReplyPostForm(opts: {
  csrfToken?: string;
  post: any;
  topic: any;
  allCwTags: CwTag[];
}): string {
  const { post, topic, allCwTags } = opts;
  const quoteAuthor = post.author_display_name || post.anon_name || `user${post.user_id}`;
  const isOpPost = !post.parent_post_id;
  const anchorHref = `#post-${isOpPost ? 't' : ''}${post.id}`;
  const quotedDate = new Date(post.created_at.includes('T') ? post.created_at : post.created_at.replace(' ', 'T') + 'Z')
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const quotedBody = esc(post.content).split('\\n').join('\\n> ');
  const quotePrefill = `> On ${quotedDate}, [**${esc(quoteAuthor)}**](${anchorHref}) said:\n> \n> ${quotedBody}\n\n`;
  return `
    <form method="POST" action="/posts" hx-post="/posts" hx-target="this" hx-swap="outerHTML" class="reply-post" style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:var(--bg-color);margin-top:12px;margin-left:48px;">
      ${csrfField(opts)}
      <input type="hidden" name="topic_id" value="${topic.id}">
      <input type="hidden" name="parent_post_id" value="${post.id}">
      <h1 style="margin:0 0 14px;font-size:16px;font-weight:600;"><!--extb-ui-->Reply<!--/extb-ui--></h1>
      ${markdownToolbar(`reply-post-${post.id}-content`, `reply-post-${post.id}-preview`)}
      <textarea id="reply-post-${post.id}-content" name="content" required rows="6" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-family:inherit;margin-bottom:12px;">${quotePrefill}</textarea>
      ${tagPicker(allCwTags, [])}
      <div style="display:flex;gap:12px;">
        <button type="submit" class="btn"><!--extb-ui-->Post Reply<!--/extb-ui--></button>
        <button type="button" class="btn" style="background:#e5e7eb;color:#374151;" onclick="this.closest('form').remove()"><!--extb-ui-->Cancel<!--/extb-ui--></button>
      </div>
    </form>`;
}

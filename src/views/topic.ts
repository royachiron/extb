import { renderPost } from './post';
import { renderReportButton, renderReportSlot } from './report';
import { esc, markdownToolbar, csrfField, loadMoreButton } from './layout';
import { turnstileScript, turnstileWidgetBlock } from './turnstile';
import { canPost } from '../access';
import { tagPicker } from './tags';
import type { CwTag, Room } from '../types';

export function renderTopic(opts: {
  topic: any;
  posts: any[];
  isFollowing: boolean;
  user: any;
  room: any;
  poll?: any;
  userVotes?: number[];
  csrfToken: string;
  siteKey?: string;
  allCwTags?: CwTag[];
  allRooms?: Room[];
  ironGateActive?: boolean;
  nextCursor?: string | null;
}): string {
  const { topic, posts, isFollowing, user, room, poll, userVotes = [], csrfToken, siteKey, allCwTags, allRooms = [], ironGateActive, nextCursor = null } = opts;

  // Does this viewer actually have permission to post in this room?
  // Used to gate every reply surface so we never show a composer that the
  // server (canPost in src/api/topics.ts) will reject with a silent 403.
  const mayPost = canPost(user, room, ironGateActive);

  const pollHtml = poll ? renderPoll(poll, user, userVotes, topic) : '';

  const isMod = user && ['mod', 'admin'].includes(user.access_level);
  const isOwner = user && user.id === topic.user_id;

  const htmxFollowBtn = user
    ? `<button hx-post="/t/${topic.short_id}/${isFollowing ? 'unfollow' : 'follow'}"
               hx-target="closest div"
               hx-swap="outerHTML"
               class="action-btn"
               style="background:${isFollowing ? 'var(--border-color)' : 'var(--primary)'}; color:${isFollowing ? 'var(--text-main)' : '#fff'};">
         ${isFollowing ? 'Following' : 'Follow'}
       </button>`
    : '';

  const canWarnTopic = isMod && topic.user_id && (!user || topic.user_id !== user.id);
  const warnKey = `t${topic.id}`;

  const modTools = isMod ? `
    ${isOwner ? `
    <div class="topic-tools-tabs" style="display:flex;gap:4px;margin-top:12px;margin-bottom:8px;">
      <button class="topic-tools-tab action-btn active" data-panel="tp-mod-${topic.short_id}" style="background:var(--primary);color:#fff;border-color:var(--primary);">Mod tools</button>
      <button class="topic-tools-tab action-btn" data-panel="tp-owner-${topic.short_id}">My OP</button>
    </div>` : ''}
    <div id="tp-mod-${topic.short_id}" class="topic-tools-panel">
    <div style="display:flex;gap:8px;flex-wrap:wrap;${isOwner ? '' : 'margin-top:12px;'}">
      <form method="POST" action="/t/${topic.short_id}/pin">
        <button type="submit" class="action-btn" title="${topic.is_pinned ? 'Unpin' : 'Pin'} topic">
          📌 ${topic.is_pinned ? 'Unpin' : 'Pin'}
        </button>
      </form>
      <form method="POST" action="/t/${topic.short_id}/lock">
        <button type="submit" class="action-btn" title="${topic.is_locked ? 'Unlock' : 'Lock'} topic">
          🔒 ${topic.is_locked ? 'Unlock' : 'Lock'}
        </button>
      </form>
      <form method="POST" action="/t/${topic.short_id}/review" hx-post="/t/${topic.short_id}/review">
        ${csrfField({ csrfToken })}
        <button type="submit" class="action-btn" title="${topic.require_review ? 'Disable' : 'Enable'} review mode">
          🛡️ ${topic.require_review ? 'Review: ON' : 'Review: OFF'}
        </button>
      </form>
      <details class="move-thread-wrap" style="position:relative;">
        <summary class="action-btn" style="cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:4px;">
          📦 Move
        </summary>
        <form method="POST" action="/t/${topic.short_id}/move" style="position:absolute;top:calc(100% + 6px);left:0;z-index:10;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px;min-width:260px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          ${csrfField({ csrfToken })}
          <label style="font-size:12px;color:var(--text-muted);">Move to room</label>
          <select name="target_room_id" required style="padding:6px;">
            <option value="">- pick a room -</option>
            ${allRooms.map(r => `<option value="${r.id}">${esc(r.name)} (/r/${esc(r.slug)})${(r.min_read === 'full' || r.min_post === 'full') ? ' ⚠️ gated' : ''}</option>`).join('')}
          </select>
          <label style="font-size:12px;color:var(--text-muted);">Reason (optional)</label>
          <input type="text" name="reason" maxlength="200" placeholder="e.g. better fit for /r/coping" style="padding:6px;">
          <button type="submit" class="btn btn-sm" data-confirm="Move this thread to the selected room?">Move</button>
        </form>
      </details>
      <a href="/t/${topic.short_id}/edit" hx-get="/t/${topic.short_id}/edit" hx-target=".main" hx-push-url="true" class="action-btn" style="text-decoration:none;">
        ✏️ Edit
      </a>
      <form method="POST" action="/t/${topic.short_id}/delete">
        <button type="button" data-confirm="Delete this topic?" class="action-btn" style="color:var(--danger);border-color:var(--danger);">
          🗑️ Delete
        </button>
      </form>
      <button type="button" onclick="enterBatchMode()" id="batch-toggle" class="action-btn" title="Select multiple posts to delete at once">
        ☑️ Mass delete
      </button>
      ${canWarnTopic ? `
      <button type="button" class="action-btn" data-warn-open="${warnKey}">⚠️ Warn Author</button>` : ''}
    </div>
    ${canWarnTopic ? `
    <div class="modal-overlay warn-modal-overlay" id="warn-modal-${warnKey}" data-warn-modal="${warnKey}">
      <div class="modal-card warn-modal">
        <h3>Warn this author</h3>
        <p>Your message is delivered to the author from Boterator. The topic stays visible.</p>
        <form method="POST" action="/t/${topic.short_id}/warn" hx-post="/t/${topic.short_id}/warn">
          ${csrfField({ csrfToken })}
          <textarea name="memo" rows="3" required placeholder="Warning message to the author…"></textarea>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-warn-close="${warnKey}">Cancel</button>
            <button type="submit" class="btn btn-sm">Send warning</button>
          </div>
        </form>
      </div>
    </div>` : ''}
    </div>
    ${isOwner ? `
    <div id="tp-owner-${topic.short_id}" class="topic-tools-panel" style="display:none;margin-top:8px;">
      <form method="POST" action="/t/${topic.short_id}/delete">
        ${csrfField({ csrfToken })}
        <input type="hidden" name="owner_wipe" value="1">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;margin-bottom:6px;">
          <input type="checkbox" name="keep_replies" value="1">
          Keep my replies (post anonymously)
        </label>
        <button type="button" data-confirm="Remove your opening post? Your name, content, and your replies will be wiped. Check the box above to keep your replies as anonymous instead. This cannot be undone." class="action-btn" style="color:var(--danger);border-color:var(--danger);">
          🗑️ Wipe my OP
        </button>
      </form>
    </div>` : ''}` : (isOwner ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <a href="/t/${topic.short_id}/edit" hx-get="/t/${topic.short_id}/edit" hx-target=".main" hx-push-url="true" class="action-btn" style="text-decoration:none;">
        ✏️ Edit
      </a>
      <form method="POST" action="/t/${topic.short_id}/delete">
        ${csrfField({ csrfToken })}
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;margin-bottom:6px;">
          <input type="checkbox" name="keep_replies" value="1">
          Keep my replies (post anonymously)
        </label>
        <button type="button" data-confirm="Remove your opening post? Your name, content, and your replies will be wiped. Check the box above to keep your replies as anonymous instead. This cannot be undone." class="action-btn" style="color:var(--danger);border-color:var(--danger);">
          🗑️ Delete
        </button>
      </form>
    </div>` : '');

  const breadcrumbs = `
    <nav class="breadcrumb">
      <a href="/" hx-get="/" hx-target=".main" hx-push-url="true">Home</a>
      <span class="breadcrumb-sep">&rsaquo;</span>
      <a href="/r/${esc(room.slug)}" hx-get="/r/${esc(room.slug)}" hx-target=".main" hx-push-url="true">${esc(room.name)}</a>
    </nav>`;

  const replyComposer = user && mayPost
    ? `
    <div class="reply-composer" style="margin-top:48px; padding-top:32px; border-top:2px solid var(--border-color);">
      <h3 style="margin:0 0 20px; font-size:20px; font-weight:700;">Join the Discussion</h3>
      <form method="post" hx-post="/posts" hx-target="#post-list" hx-swap="beforeend" hx-on::after-request="if(event.detail.successful){this.reset();document.getElementById('reply-content').focus();}">
        <input type="hidden" name="topic_id" value="${topic.id}">
        ${markdownToolbar('reply-content', 'reply-preview')}
        <textarea id="reply-content" name="content" required rows="6" placeholder="Type your reply here..." style="margin-bottom:12px;"></textarea>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:13px; color:var(--text-muted);">Ctrl+Enter to post</span>
          <button type="submit" class="btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Post Reply
          </button>
        </div>
      </form>
    </div>`
    : !user && room.min_post === 'anon' && !topic.is_locked
    ? `
    <div class="reply-composer" style="margin-top:48px; padding-top:32px; border-top:2px solid var(--border-color);">
      <h3 style="margin:0 0 20px; font-size:20px; font-weight:700;">Reply</h3>
      <form method="post" action="/posts">
        ${csrfField({ csrfToken })}
        <input type="hidden" name="topic_id" value="${topic.id}">
        <label style="display:block;font-weight:600;margin-bottom:8px;color:var(--text-main)">Name <span style="font-weight:400;color:var(--text-muted)">(optional)</span>
          <input type="text" name="anon_name" maxlength="40" placeholder="anonymous" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;background:var(--card-bg);color:var(--text-main);">
        </label>
        <label style="display:block;font-weight:600;margin:16px 0 8px;color:var(--text-main)">Your reply
          <textarea name="content" required maxlength="10000" rows="5" placeholder="Share your thoughts..." style="width:100%;font:15px/1.6 inherit;padding:12px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;margin-top:4px;resize:vertical;background:var(--card-bg);color:var(--text-main);"></textarea>
        </label>
        ${turnstileWidgetBlock(siteKey)}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
          <span style="font-size:13px;color:var(--text-muted);">Posts go to moderator review before appearing.</span>
          <button type="submit" class="btn">Submit Reply</button>
        </div>
      </form>
      ${turnstileScript(siteKey)}
    </div>`
    : user
    ? `
    <div style="margin-top:48px; padding:32px; background:var(--card-bg); border-radius:16px; text-align:center; border: 2px dashed var(--border-color);">
      <p style="margin:0 0 8px; font-weight:600; color:var(--text-main);">This room is read-only for your access level.</p>
      <p style="margin:0 0 16px; font-size:14px; color:var(--text-muted);">You don&rsquo;t have permission to reply in this room.</p>
    </div>`
    : `
    <div style="margin-top:48px; padding:32px; background:var(--card-bg); border-radius:16px; text-align:center; border: 2px dashed var(--border-color);">
      <p style="margin:0 0 16px; font-weight:600; color:var(--text-muted);">Want to join the conversation?</p>
      <a href="/login" hx-get="/login" hx-target=".main" hx-push-url="true" class="btn">Log in to Reply</a>
    </div>`;

  return `
<div id="forum">
  ${breadcrumbs}
  <div class="topic-head" style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:${modTools ? '12px' : '32px'};">
    <h1 style="margin:0; line-height:1.2;">${esc(topic.title)}</h1>
    <div style="flex-shrink:0; display:flex; gap:8px;">${user && !isOwner && !isMod && topic.user_id ? renderReportButton('topic', topic.id) : ''}${htmxFollowBtn}</div>
  </div>
  ${user && !isOwner && !isMod && topic.user_id ? renderReportSlot('topic', topic.id) : ''}
  ${modTools ? `<div style="margin-bottom:32px;">${modTools}</div>` : ''}

  ${pollHtml}

  ${isMod ? `
  <div id="batch-bar" style="display:none;position:sticky;top:0;z-index:10;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 16px;margin-bottom:12px;display:none;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <span id="batch-count" style="font-size:14px;font-weight:600;">0 selected</span>
    <button type="button" onclick="submitBatchAction('${topic.short_id}', 'soft')" class="btn" style="padding:6px 14px;font-size:13px;">Soft Delete</button>
    <button type="button" onclick="submitBatchAction('${topic.short_id}', 'hard')" class="btn" style="background:var(--danger);border-color:var(--danger);padding:6px 14px;font-size:13px;">Hard Delete</button>
    <button type="button" onclick="submitBatchAction('${topic.short_id}', 'remove')" class="btn" style="padding:6px 14px;font-size:13px;">Remove</button>
    <button type="button" onclick="exitBatchMode()" class="action-btn" style="padding:6px 14px;font-size:13px;">Cancel</button>
  </div>
  ` : ''}

  <div id="post-list">
    ${renderPost(topic, true, user, topic.user_id, csrfToken, user, allCwTags, mayPost)}
    ${renderPostList(posts, topic, user, csrfToken, allCwTags, mayPost)}
  </div>
  ${renderLoadMorePosts(topic.short_id, nextCursor)}

  ${replyComposer}
</div>
`;
}

/**
 * Flat post list with ancestor-chain metadata for indent rendering. Safe to
 * call per pagination batch: pages are root-aligned (each batch contains
 * complete subtrees), so chains computed within one batch are complete.
 */
export function renderPostList(
  posts: any[],
  topic: any,
  user: any,
  csrfToken: string,
  allCwTags?: CwTag[],
  mayPost?: boolean,
): string {
  const chains = new Map<number, string>();
  const hasChildren = new Set<number>();
  for (const p of posts as any[]) {
    if (p.parent_post_id != null) hasChildren.add(p.parent_post_id);
  }
  return posts.map((p: any) => {
    const parentChain = p.parent_post_id != null ? (chains.get(p.parent_post_id) ?? '') : '';
    const myChain = parentChain ? `${parentChain} ${p.parent_post_id}` : (p.parent_post_id != null ? String(p.parent_post_id) : '');
    chains.set(p.id, myChain);
    return renderPost({ ...p, _ancestorChain: myChain, _hasChildren: hasChildren.has(p.id) }, false, user, topic.user_id, csrfToken, user, allCwTags, mayPost);
  }).join('');
}

/**
 * Load-more control below #post-list. The partial handler swaps this div
 * (outerHTML) with a fresh button + an OOB beforeend append into #post-list,
 * so the composer's own beforeend append keeps working unchanged.
 */
export function renderLoadMorePosts(shortId: string, nextCursor: string | null): string {
  return loadMoreButton({
    id: 'post-more',
    href: nextCursor ? `/t/${esc(shortId)}/posts?after=${encodeURIComponent(nextCursor)}` : null,
    label: 'Load more replies',
  });
}

export function renderPoll(poll: any, user: any, userVotes: number[], topic: any): string {
  const hasVoted = userVotes.length > 0;
  const isEnded = poll.ends_at && new Date(poll.ends_at.replace(' ', 'T') + 'Z') < new Date();
  const showResults = hasVoted || isEnded || !user;

  const totalVotes = poll.options.reduce((sum: number, o: any) => sum + o.votes, 0);

  let body = '';
  if (showResults) {
    body = `
      <div class="poll-results" style="display:flex; flex-direction:column; gap:16px;">
        ${poll.options.map((o: any) => {
          const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
          const isChosen = userVotes.includes(o.id);
          return `
            <div class="poll-result-row">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:14px; font-weight:600;">
                <span>${esc(o.text)} ${isChosen ? '<span style="color:var(--primary);margin-left:8px;">✓ Your vote</span>' : ''}</span>
                <span>${o.votes} votes (${pct}%)</span>
              </div>
              <div style="height:12px; background:var(--border-color); border-radius:6px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:var(--primary); border-radius:6px; transition:width 0.5s ease;"></div>
              </div>
            </div>`;
        }).join('')}
        <div style="font-size:13px; color:var(--text-muted); margin-top:8px;">
          Total votes: ${totalVotes} ${isEnded ? '• Poll ended' : ''}
        </div>
        ${!user && !isEnded ? '<p style="font-size:13px; color:var(--text-muted); margin:0;"><a href="/login" style="color:var(--primary);text-decoration:none;">Log in</a> to vote.</p>' : ''}
      </div>`;
  } else {
    body = `
      <form hx-post="/t/${topic.short_id}/poll/vote" hx-target="#forum" hx-swap="outerHTML">
        <div class="poll-options" style="display:flex; flex-direction:column; gap:12px;">
          ${poll.options.map((o: any) => `
            <label style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:8px; cursor:pointer; transition:border-color 0.2s;">
              <input type="${poll.multi_select ? 'checkbox' : 'radio'}" name="option" value="${o.id}" style="width:18px; height:18px; margin:0;">
              <span style="font-size:15px; font-weight:500;">${esc(o.text)}</span>
            </label>
          `).join('')}
        </div>
        <button type="submit" class="btn" style="margin-top:20px; width:100%; justify-content:center;">Cast Vote</button>
      </form>`;
  }

  return `
    <div class="poll-container" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:12px; padding:24px; margin-bottom:40px;">
      <h2 style="margin:0 0 20px; font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px;">
        <span style="font-size:24px;">📊</span> ${esc(poll.question)}
      </h2>
      ${body}
    </div>`;
}

// Edit-topic form + follow/unfollow toggle buttons, extracted byte-identical
// from api/topics.ts (getEditTopicForm / postFollowTopic / postUnfollowTopic).
export function renderEditTopicForm(opts: {
  csrfToken?: string;
  topic: any;
  allCwTags: CwTag[];
  selectedTagIds: number[];
}): string {
  const { topic, allCwTags, selectedTagIds } = opts;
  return `
    <form method="POST" action="/t/${topic.short_id}/edit" class="edit-topic" style="max-width:780px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      ${csrfField(opts)}
      <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;">Edit Topic</h1>
      <label style="display:block;font-weight:600;margin-bottom:8px;color:#374151">Title
        <input name="title" required maxlength="140" value="${esc(topic.title)}" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;transition:border-color 0.2s">
      </label>
      <label style="display:block;font-weight:600;margin:16px 0 8px;color:#374151">Message
        ${markdownToolbar('edit-topic-content', 'edit-topic-preview')}
        <textarea id="edit-topic-content" name="content" required rows="16" style="width:100%;font:15px/1.6 inherit;padding:12px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;margin-top:4px;resize:vertical;transition:border-color 0.2s">${esc(topic.content)}</textarea>
      </label>
      <label style="display:block;font-weight:600;margin:16px 0 8px;color:#374151">Tags <span style="font-weight:400;color:#6b7280">(comma separated)</span>
        <input name="tags" value="${esc(topic.tags ?? '')}" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;transition:border-color 0.2s" placeholder="e.g. general, help, discussion">
      </label>
      ${tagPicker(allCwTags, selectedTagIds)}
      <div style="margin-top:24px;display:flex;gap:12px">
        <button type="submit" class="btn" style="padding:10px 20px;font-size:15px">Save Changes</button>
        <a href="/t/${topic.short_id}" hx-get="/t/${topic.short_id}" hx-target=".main" hx-push-url="true" class="btn" style="background:#f3f4f6;color:#374151;padding:10px 20px;font-size:15px;display:inline-flex;align-items:center">Cancel</a>
      </div>
    </form>`;
}

export function renderFollowingButton(shortId: string): string {
  return `<button hx-post="/t/${shortId}/unfollow" hx-target="closest div" hx-swap="outerHTML" class="action-btn" style="background:#e5e7eb; color:#374151;">Following</button>`;
}

export function renderFollowButton(shortId: string): string {
  return `<button hx-post="/t/${shortId}/follow" hx-target="closest div" hx-swap="outerHTML" class="action-btn" style="background:#2563eb; color:#fff;">Follow</button>`;
}

import type { User, Room, Topic } from '../types';
import { renderLayout, esc, csrfField } from './layout';
import { canPost, isMod } from '../access';
import { cwTagPills } from './tags';
import { turnstileScript, turnstileWidgetBlock } from './turnstile';

function relTime(iso: string): string {
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return iso;
  return `<span class="rel-time" data-utc="${iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'}">${iso}</span>`;
}

function authorLabel(t: Topic): string {
  const name = t.author_display_name || `user${t.user_id}`;
  if (t.user_id == null) return `<span class="author-anon">${esc(t.anon_name ?? 'anon')}</span>`;
  return `<a href="/u/${esc(name)}" hx-get="/u/${esc(name)}" hx-target=".main" hx-push-url="true" class="author-link">${esc(name)}</a>`;
}

function renderTopicCard(t: Topic, user: User | null, rooms: Room[]): string {
  const mod = isMod(user);
  const room = rooms.find((r) => r.id === t.room_id);
  const roomName = room?.name ?? '';
  const roomSlug = room?.slug ?? '';

  if (t.deleted_at && !mod) return '';
  const deletedTag = t.deleted_at
    ? `<span class="deleted">[deleted${t.delete_reason ? `: ${esc(t.delete_reason)}` : ''}]</span> `
    : '';
  const pin = t.is_pinned ? '<span class="pin" title="Pinned">📌</span> ' : '';
  const lock = t.is_locked ? '<span class="lock" title="Locked">🔒</span> ' : '';
  const poll = (t as any).has_poll ? '<span class="poll" title="Poll">📊</span> ' : '';
  const unread = t.is_unread ? 1 : 0;
  const unreadDot = unread ? '<span class="tc-unread-dot" title="Unread"></span>' : '';

  const tagChips = t.tags
    ? t.tags.split(',').map((tag: string) => `<a href="/search?q=${esc(tag.trim())}" hx-get="/search?q=${esc(tag.trim())}" hx-target=".main" hx-push-url="true" class="tag-chip">#${esc(tag.trim())}</a>`).join('')
    : '';

  return `
    <article class="topic-card${unread ? ' topic-card--unread' : ''}">
      <div class="tc-main" style="flex:1;min-width:0;">
        <h3 class="tc-title" style="margin:0 0 2px;font-size:15px;line-height:1.25;">${unreadDot}${pin}${lock}${poll}${deletedTag}<a href="/t/${t.short_id}" hx-get="/t/${t.short_id}" hx-target=".main" hx-push-url="true" class="topic-title-link">${esc(t.title)}</a></h3>
        ${cwTagPills((t as any).cw_tags)}
        <p class="tc-meta" style="margin:0;font-size:12px;color:var(--text-muted);">
          <span style="font-weight:600;">${authorLabel(t)}</span> ·
          <a href="/r/${esc(roomSlug)}" hx-get="/r/${esc(roomSlug)}" hx-target=".main" hx-push-url="true" class="badge badge-primary" style="text-decoration:none;">${esc(roomName)}</a>
        </p>
        ${tagChips ? `<div class="tc-tags" style="margin-top:3px;">${tagChips}</div>` : ''}
      </div>
      <div class="tc-aside" style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-muted);margin-top:3px;flex-shrink:0;">
        <span class="tc-count" style="font-weight:700;color:var(--text-main);">${t.active_reply_count ?? t.reply_count}</span>
        <span class="tc-label">repl${(t.active_reply_count ?? t.reply_count) === 1 ? 'y' : 'ies'}</span>${mod && t.reply_count > (t.active_reply_count ?? t.reply_count) ? `<span style="font-size:11px;color:var(--text-muted);margin-left:2px;">(${t.reply_count - (t.active_reply_count ?? t.reply_count)} del)</span>` : ''}
        <span>·</span>
        ${relTime(t.last_reply_at)}
      </div>
    </article>`;
}

export function renderTopicCards(topics: Topic[], user: User | null, rooms: Room[]): string {
  if (topics.length === 0) return '<p style="color:var(--text-muted);padding:16px 0;"><!--extb-ui-->No topics yet.<!--/extb-ui--></p>';
  return topics.map((t) => renderTopicCard(t, user, rooms)).join('');
}

export function renderForumIndex(opts: {
  user: User | null;
  rooms: any[];
  topTopics: any[];
  latestReplies: any[];
  topContributors: any[];
}): string {
  const { user, rooms, topTopics, latestReplies, topContributors } = opts;

  const rows = rooms.map((r: any) => {
    const unread = (r.unread_count ?? 0) > 0
      ? '<span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;margin-left:4px;vertical-align:middle;" title="Unread"></span>'
      : '';
    const icon = r.icon ? esc(r.icon) : '💬';
    const lastPostHtml = r.last_topic_id
      ? `<a href="/t/${r.last_short_id}" hx-get="/t/${r.last_short_id}" hx-target=".main" hx-push-url="true" class="fi-lp-lnk">${esc((r.last_topic_title || '').substring(0, 45))}${(r.last_topic_title || '').length > 45 ? '…' : ''}</a>
         <div class="fi-lp-meta">${esc(r.last_author || 'unknown')} · ${relTime(r.last_activity_at || '')}</div>`
      : '<span class="fi-lp-meta"><!--extb-ui-->No posts yet<!--/extb-ui--></span>';
    return `
    <div class="fi-rr">
      <div class="fi-rr-top fi-rc">
        <div class="fi-ri">${icon}</div>
        <div class="fi-rr-info">
          <div><a href="/r/${esc(r.slug)}" hx-get="/r/${esc(r.slug)}" hx-target=".main" hx-push-url="true" class="fi-rn">${esc(r.name)}</a>${unread}</div>
          ${r.description ? `<div class="fi-rd">${esc(r.description)}</div>` : ''}
        </div>
      </div>
      <div class="fi-rr-lp">${lastPostHtml}</div>
      <div class="fi-rs-w fi-rr-stats">
        <div class="fi-rs"><strong>${r.total_topics ?? 0}</strong><small>topics</small></div>
        <div class="fi-rs"><strong>${r.total_replies ?? 0}</strong><small>replies</small>${isMod(user) && (r.total_replies_all ?? 0) > (r.total_replies ?? 0) ? `<small style="color:var(--text-muted);font-size:10px;"> (${(r.total_replies_all ?? 0) - (r.total_replies ?? 0)} del)</small>` : ''}</div>
      </div>
    </div>`;
  }).join('');

  return `
<div class="fi-layout">
  <div class="fi-main">
    <div class="fi-hdr">
      <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;"><!--extb-ui-->FORUM INDEX<!--/extb-ui--></h1>
    </div>
    <div class="fi-rl">${rows || '<div style="padding:24px;text-align:center;color:var(--text-muted);"><!--extb-ui-->No rooms yet.<!--/extb-ui--></div>'}</div>
    ${user ? '' : '<p style="margin-top:16px;font-size:13px;color:var(--text-muted);"><a href="/login" hx-get="/login" hx-target=".main" hx-push-url="true" style="color:var(--primary);"><!--extb-ui-->Log in<!--/extb-ui--></a> to post.</p>'}
  </div>
  <aside class="fi-aside">
    ${renderIndexPanels(user, topTopics, latestReplies, topContributors)}
  </aside>
</div>`;
}

/**
 * The three index side panels. Shared by /forum and /needs-you so that moving
 * the nav slot to Needs You does not silently delete them from the product.
 */
export function renderIndexPanels(
  user: User | null,
  topTopics: any[],
  latestReplies: any[],
  topContributors: any[]
): string {
  const topTopicsHtml = topTopics.length
    ? topTopics.map((t: any) => {
        const mod = isMod(user);
        const activeCount = t.active_reply_count ?? t.reply_count;
        const deletedCount = mod ? t.reply_count - activeCount : 0;
        return `
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border-color);">
        <a href="/t/${t.short_id}" hx-get="/t/${t.short_id}" hx-target=".main" hx-push-url="true" style="font-size:13px;font-weight:600;color:var(--text-main);text-decoration:none;display:block;margin-bottom:2px;">${t.is_pinned ? '📌 ' : ''}${esc(t.title)}</a>
        <span style="font-size:11px;color:var(--text-muted);">${esc(t.author_display_name || 'anon')}</span>
        <span style="font-size:11px;color:var(--text-muted);margin:0 4px;">·</span>
        <span style="font-size:11px;font-weight:600;color:var(--primary);">${activeCount} repl${activeCount === 1 ? 'y' : 'ies'}${deletedCount > 0 ? ` <span style="font-weight:400;color:var(--text-muted);">(${deletedCount} del)</span>` : ''}</span>
        <span style="font-size:11px;color:var(--text-muted);margin:0 4px;">·</span>
        ${relTime(t.last_reply_at)}
      </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted);"><!--extb-ui-->No topics yet.<!--/extb-ui--></p>';

  const latestRepliesHtml = latestReplies.length
    ? latestReplies.map((p: any) => {
        const avatarColor = p.avatar_color || '#6366f1';
        const initial = (p.author_name || '?')[0].toUpperCase();
        const preview = (p.content || '').replace(/[#*`_>[\]]/g, '').substring(0, 60);
        const avatarEl = p.avatar_url
          ? `<img src="${esc(p.avatar_url)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
          : `<div style="width:28px;height:28px;border-radius:50%;background:${esc(avatarColor)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;">${esc(initial)}</div>`;
        return `
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-start;">
          ${avatarEl}
          <div style="min-width:0;">
            <div style="font-size:12px;color:var(--text-muted);">"${esc(preview)}${preview.length >= 60 ? '…' : ''}"</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              <a href="/r/${esc(p.room_slug)}" hx-get="/r/${esc(p.room_slug)}" hx-target=".main" hx-push-url="true" style="display:inline-block;padding:1px 6px;border-radius:999px;background:var(--primary);color:#fff;font-size:10px;font-weight:700;text-decoration:none;">${esc(p.room_name)}</a> ${relTime(p.created_at)}
            </div>
          </div>
        </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted);"><!--extb-ui-->No replies yet.<!--/extb-ui--></p>';

  const topContributorsHtml = topContributors.length
    ? topContributors.map((u: any, i: number) => {
        const avatarColor = u.avatar_color || '#6366f1';
        const initial = (u.display_name || '?')[0].toUpperCase();
        const avatarEl = u.avatar_url
          ? `<img src="${esc(u.avatar_url)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
          : `<div style="width:24px;height:24px;border-radius:50%;background:${esc(avatarColor)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;">${esc(initial)}</div>`;
        return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-weight:700;color:var(--text-muted);font-size:12px;width:14px;">${i + 1}.</span>
          ${avatarEl}
          <div style="min-width:0;flex:1;">
            <a href="/u/${esc(u.display_name)}" hx-get="/u/${esc(u.display_name)}" hx-target=".main" hx-push-url="true" style="font-size:13px;font-weight:600;color:var(--text-main);text-decoration:none;">${esc(u.display_name)}</a>
            <div style="font-size:11px;color:var(--text-muted);"><!--extb-ui-->Posts:<!--/extb-ui--> ${u.topic_count}, <!--extb-ui-->Comments:<!--/extb-ui--> ${u.post_count}</div>
          </div>
        </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted);">No contributors yet.</p>';

  return `
    <div class="fi-sc">
      <div class="fi-sc-hd"><!--extb-ui-->Top Topics<!--/extb-ui--></div>
      <div style="padding:12px 14px;">${topTopicsHtml}</div>
    </div>
    <div class="fi-sc">
      <div class="fi-sc-hd"><!--extb-ui-->Latest Replies <!--/extb-ui--><span class="fi-sc-new">NEW</span></div>
      <div style="padding:12px 14px;">${latestRepliesHtml}</div>
    </div>
    <div class="fi-sc">
      <div class="fi-sc-hd"><!--extb-ui-->Top Contributors <!--/extb-ui--><span class="fi-sc-new">NEW</span></div>
      <div style="padding:12px 14px;">${topContributorsHtml}</div>
    </div>`;
}

/**
 * Needs You: threads nobody has answered yet, oldest first.
 *
 * Replaces the Forum tab in the nav. Inherits the three sidebar panels from
 * renderForumIndex so killing that tab does not silently delete them - /forum
 * itself stays live and keeps rendering them too.
 */
export function renderNeedsYou(opts: {
  user: User | null;
  rooms: Room[];
  topics: Topic[];
  windowDays: number;
  topTopics: any[];
  latestReplies: any[];
  topContributors: any[];
}): string {
  const { user, rooms, topics, windowDays } = opts;

  const list = topics.length === 0
    ? `<div class="ny-empty">
         <div class="ny-empty-title"><!--extb-ui-->Nothing waiting<!--/extb-ui--></div>
         <p class="ny-empty-sub"><!--extb-ui-->Everyone's been answered.<!--/extb-ui--></p>
         <a href="/post" hx-get="/post" hx-target=".main" hx-push-url="true" class="btn btn-primary"><!--extb-ui-->Start a discussion<!--/extb-ui--></a>
       </div>`
    : topics.map((t) => {
        const room = rooms.find((r) => r.id === t.room_id);
        const created = t.created_at.includes('T') ? t.created_at : t.created_at.replace(' ', 'T') + 'Z';
        const ageMs = Date.now() - Date.parse(created);
        const daysLeft = windowDays - Math.floor(ageMs / 86400000);
        const urgent = daysLeft <= 3;
        const ageLabel = daysLeft <= 0
          ? 'ages out today'
          : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
        const author = t.user_id == null
          ? esc(t.anon_name ?? 'anon')
          : esc(t.author_display_name || `user${t.user_id}`);
        return `
    <a class="ny-item" href="/t/${t.short_id}" hx-get="/t/${t.short_id}" hx-target=".main" hx-push-url="true">
      <div class="ny-title">${esc(t.title)}</div>
      ${cwTagPills((t as any).cw_tags)}
      <div class="ny-meta">
        <span class="badge badge-primary">${esc(room?.name ?? '')}</span>
        <span>${author}</span>
        <span class="ny-age${urgent ? ' ny-age--urgent' : ''}">${ageLabel}</span>
      </div>
    </a>`;
      }).join('');

  const count = topics.length;
  const sub = count === 0
    ? 'Nothing is waiting for a reply.'
    : `${count} thread${count === 1 ? '' : 's'} nobody has answered.`;

  return `
<div class="fi-layout">
  <div class="fi-main">
    <div class="fi-hdr">
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;"><!--extb-ui-->Needs you<!--/extb-ui--></h1>
        <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">${sub}</p>
      </div>
    </div>
    <div class="ny-list">${list}</div>
    ${count > 0 ? `<p class="ny-foot">Oldest first. Threads leave this list after ${windowDays} days.</p>` : ''}
  </div>
  <aside class="fi-aside">
    ${renderIndexPanels(user, opts.topTopics, opts.latestReplies, opts.topContributors)}
  </aside>
</div>`;
}

export const FEED_PAGE_SIZE = 30;

/**
 * Load-more control below #topic-list. The append branch of getFeed swaps
 * this div (outerHTML) with a fresh control + an OOB beforeend append of the
 * next page's cards into #topic-list.
 */
export function renderFeedMore(baseUrl: string, nextPage: number | null): string {
  if (nextPage === null) return `<div id="feed-more"></div>`;
  return `<div id="feed-more" style="margin:16px 0;text-align:center;">
    <button class="btn btn-secondary"
      hx-get="${esc(baseUrl)}?list=1&append=1&page=${nextPage}"
      hx-target="#feed-more" hx-swap="outerHTML"
      hx-on::after-request="document.getElementById('topic-list').dataset.paged='1'"
    ><!--extb-ui-->Load more topics<!--/extb-ui--></button>
  </div>`;
}

export function renderFeed(opts: {
  user: User | null;
  rooms: Room[];
  activeRoom: Room | null;
  topics: Topic[];
  pollUrl: string;
  siteKey?: string;
  csrfToken?: string;
  gate?: boolean;
  ironGateActive?: boolean;
  hasMore?: boolean;
  baseUrl?: string;
  page?: number;
}): string {
  const { user, rooms, activeRoom, topics, pollUrl, siteKey, csrfToken, gate = false, ironGateActive = false, hasMore = false, baseUrl = '/', page = 0 } = opts;
  const canCompose = !!activeRoom && canPost(user, activeRoom, ironGateActive);

  const anonComposer = activeRoom?.min_post === 'anon' && !user
    ? `<div class="card" style="margin-bottom:24px;">
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;"><!--extb-ui-->Ask a question<!--/extb-ui--></h3>
        <p style="margin:0 0 16px;color:var(--text-muted);font-size:14px;">Anyone can ask. Posts go to moderator review before appearing.</p>
        <form method="post" action="/topics">
          ${csrfField({ csrfToken })}
          <input type="hidden" name="room_id" value="${activeRoom.id}">
          <label style="display:block;font-weight:600;margin-bottom:8px;color:var(--text-main)"><!--extb-ui-->Name <!--/extb-ui--><span style="font-weight:400;color:var(--text-muted)"><!--extb-ui-->(optional)<!--/extb-ui--></span>
            <input type="text" name="anon_name" maxlength="40" placeholder="anonymous" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;background:var(--card-bg);color:var(--text-main);">
          </label>
          <label style="display:block;font-weight:600;margin:16px 0 8px;color:var(--text-main)"><!--extb-ui-->Title
            <!--/extb-ui--><input type="text" name="title" required maxlength="200" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;background:var(--card-bg);color:var(--text-main);">
          </label>
          <label style="display:block;font-weight:600;margin:16px 0 8px;color:var(--text-main)">Your question
            <textarea name="content" required maxlength="10000" rows="5" style="width:100%;font:15px/1.6 inherit;padding:12px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;margin-top:4px;resize:vertical;background:var(--card-bg);color:var(--text-main);"></textarea>
          </label>
          ${turnstileWidgetBlock(siteKey)}
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
            <span style="font-size:13px;color:var(--text-muted);">Posts go to moderator review.</span>
            <button type="submit" class="btn"><!--extb-ui-->Submit for review<!--/extb-ui--></button>
          </div>
        </form>
        ${turnstileScript(siteKey)}
      </div>`
    : '';

  const postHref = activeRoom ? `/post?room=${esc(activeRoom.slug)}` : '/post';
  const composer = !user && !anonComposer
    ? ''
    : (user && canCompose) ? `<div style="margin-bottom:16px;"><a class="btn" href="${postHref}" hx-get="${postHref}" hx-target=".main" hx-push-url="true"><!--extb-ui-->+ New Topic<!--/extb-ui--></a></div>` : '';

  const rawDesc = activeRoom?.description || '';
  const truncatedDesc = rawDesc.length > 120 ? rawDesc.substring(0, 117) + '...' : rawDesc;
  const descHtml = activeRoom && activeRoom.description
    ? `<p style="margin:8px 0 0;color:var(--text-muted);font-size:14px;" title="${esc(rawDesc)}">${esc(truncatedDesc)}</p>`
    : '';

  const cards = renderTopicCards(topics, user, rooms);

  return `
<header class="feed-head" style="margin-bottom:20px;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <h1 class="feed-title" style="margin:0;font-size:22px;font-weight:700;color:var(--text-main);">${activeRoom ? esc(activeRoom.name) : '<!--extb-ui-->most recently updated<!--/extb-ui-->'}</h1>
    <div style="display:flex;gap:8px;align-items:center;">
      ${activeRoom && isMod(user) ? `
        <button class="btn btn-secondary" 
          hx-get="/r/${activeRoom.slug}/access" 
          hx-target="body" 
          hx-swap="beforeend"
          style="padding:6px 12px; font-size:13px;">🛡️ Access</button>
      ` : ''}
    </div>
  </div>
  ${descHtml}
</header>
${anonComposer}
${composer}
<div id="topic-list"
  hx-get="${pollUrl}"
  hx-trigger="every 60s [document.visibilityState==='visible' && !document.getElementById('topic-list').dataset.paged]"
  hx-target="#topic-list"
  hx-swap="innerHTML">
  ${cards}
</div>
${renderFeedMore(baseUrl, hasMore ? page + 1 : null)}`;
}

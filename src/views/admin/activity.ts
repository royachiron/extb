import { esc } from '../layout';
import { relativeDate } from './shared';
import type { ActivityEvent, ActivityCategory, ForumViewStats } from '../../db';

// ── Activity feed ────────────────────────────────────────────────────────────

const ACTIVITY_CATEGORY: Record<string, ActivityCategory> = {
  delete_user: 'admin', set_user_access: 'admin', ban_user: 'admin', unban_user: 'admin',
  approve_question_topic: 'moderation', approve_question_post: 'moderation',
  reject_question_topic: 'moderation', reject_question_post: 'moderation',
  remove_topic: 'moderation', soft_delete_topic: 'moderation', hard_delete_topic: 'moderation',
  restore_topic: 'moderation', lock_topic: 'moderation', unlock_topic: 'moderation',
  warn_topic: 'moderation', toggle_topic_review: 'moderation', move_topic: 'moderation',
  approve_appeal: 'moderation', reject_appeal: 'moderation',
};

function activityCategory(action: string): ActivityCategory {
  return ACTIVITY_CATEGORY[action] ?? 'admin';
}

function describeActivity(ev: ActivityEvent): { verb: string; tag?: string } {
  const lvl = /level=(\w+)/.exec(ev.details ?? '')?.[1];
  switch (ev.action) {
    case 'delete_user': return { verb: 'removed', tag: (ev.details ?? '').includes('no_ban') ? 'no ban' : undefined };
    case 'set_user_access': return { verb: 'changed access of', tag: lvl };
    case 'ban_user': return { verb: 'banned' };
    case 'unban_user': return { verb: 'unbanned' };
    case 'warn_topic': return { verb: 'warned on a topic' };
    case 'remove_topic': case 'soft_delete_topic': case 'hard_delete_topic': return { verb: 'removed a topic' };
    case 'restore_topic': return { verb: 'restored a topic' };
    case 'lock_topic': return { verb: 'locked a topic' };
    case 'unlock_topic': return { verb: 'unlocked a topic' };
    case 'move_topic': return { verb: 'moved a topic' };
    case 'approve_question_topic': case 'approve_question_post': return { verb: 'approved a question' };
    case 'reject_question_topic': case 'reject_question_post': return { verb: 'rejected a question' };
    case 'approve_appeal': return { verb: 'approved a ban appeal' };
    case 'reject_appeal': return { verb: 'rejected a ban appeal' };
    case 'assign_badge': return { verb: 'changed badges for' };
    default: return { verb: ev.action.replace(/_/g, ' ') };
  }
}

function dayLabel(iso: string): string {
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === yest) return 'Yesterday';
  return day;
}

export function renderActivity(opts: {
  activityRows?: ActivityEvent[];
  activityActor?: number;
  activityCat?: string;
  stats?: ForumViewStats | null;
}): string {
  const s = opts.stats;
  const statsCard = s ? `
    <div class="card" style="padding:12px 18px;margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap;font-size:13px;">
      <div><strong>${s.users_24h}</strong> <span class="text-muted">people / ${s.views_24h} views (24h)</span></div>
      <div><strong>${s.users_7d}</strong> <span class="text-muted">people / ${s.views_7d} views (7d)</span></div>
      <div><strong>${s.users_30d}</strong> <span class="text-muted">people / ${s.views_30d} views (30d)</span></div>
    </div>` : '';
  const all = opts.activityRows ?? [];
  const cat = opts.activityCat;
  const actor = opts.activityActor;

  const rows = all.filter((ev) =>
    (!cat || cat === 'all' || activityCategory(ev.action) === cat) &&
    (!actor || ev.actor_id === actor));

  const actors = new Map<number, string>();
  for (const ev of all) if (ev.actor_name) actors.set(ev.actor_id, ev.actor_name);

  const pill = (label: string, on: boolean, params: Record<string, string | number | undefined>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `<a class="filter-pill ${on ? 'active' : ''}" href="/admin?section=activity&${qs}" hx-get="/admin?section=activity&${qs}" hx-target=".main" hx-push-url="true">${esc(label)}</a>`;
  };

  const catBar = ['all', 'moderation', 'admin']
    .map((c) => pill(c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1),
      (cat ?? 'all') === c, { cat: c, actor })).join('');
  const actorBar = [pill('Everyone', !actor, { cat: cat ?? 'all' })]
    .concat([...actors].map(([id, name]) =>
      pill(name, actor === id, { actor: id, cat: cat ?? 'all' }))).join('');

  let lastDay = '';
  const items = rows.map((ev) => {
    const d = describeActivity(ev);
    const head = dayLabel(ev.created_at);
    let dayHdr = '';
    if (head !== lastDay) { lastDay = head; dayHdr = `<h3 class="activity-day" style="margin:14px 0 4px;font-size:13px;color:var(--text-muted);">${esc(head)}</h3>`; }

    const actorLink = ev.actor_name
      ? `<a href="/u/${esc(ev.actor_name)}" hx-get="/u/${esc(ev.actor_name)}" hx-target=".main" hx-push-url="true"><strong>${esc(ev.actor_name)}</strong></a>`
      : `<strong>#${ev.actor_id}</strong>`;

    let target = '';
    if (ev.target_type === 'user') {
      target = ev.target_user_name
        ? ` <a href="/u/${esc(ev.target_user_name)}" hx-get="/u/${esc(ev.target_user_name)}" hx-target=".main" hx-push-url="true">@${esc(ev.target_user_name)}</a>`
        : ` <span class="text-muted">@user #${ev.target_id} (deleted)</span>`;
    } else if (ev.topic_short_id) {
      target = ` <a href="/t/${esc(ev.topic_short_id)}" hx-get="/t/${esc(ev.topic_short_id)}" hx-target=".main" hx-push-url="true">topic ↗</a>`;
    }

    const tag = d.tag ? ` <span class="badge">${esc(d.tag)}</span>` : '';
    const intro = ev.target_intro_short_id
      ? ` · <a href="/t/${esc(ev.target_intro_short_id)}" hx-get="/t/${esc(ev.target_intro_short_id)}" hx-target=".main" hx-push-url="true">intro ↗</a>`
      : '';

    return `${dayHdr}
      <div class="activity-row" style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">
        ${actorLink} ${esc(d.verb)}${target}${tag}${intro}
        <span class="text-muted" title="${esc(ev.created_at)}" style="margin-left:6px;">· ${esc(relativeDate(ev.created_at))}</span>
      </div>`;
  }).join('');

  return `
    <h1 class="page-title">Forum view clicks</h1>
    ${statsCard}
    <p style="color:var(--text-muted);font-size:14px;margin:0 0 12px;">Recent staff actions, newest first.</p>
    <div class="card" style="padding:12px 18px;">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${catBar}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${actorBar}</div>
      ${rows.length === 0 ? `<div class="empty-state">No matching activity.</div>` : items}
    </div>`;
}

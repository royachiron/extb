import type { Badge, User } from '../types';
import { esc, initials } from './layout';
import { renderBadgeIcon, type Badge as PillBadge } from '../lib/badges';
import { renderReportSlot } from './report';

// The chat name menu: a whois card (avatar, level, joined, community badges)
// plus actions. Server-rendered so escaping, block state, DM permission and
// mod rights are decided in one place; the chat client only positions it and
// handles the purely local actions (mention, ignore, mod purge) via the
// data-nick-act attributes. Fragment only - no <script>/<style> (the CSS lives
// in renderChat; the click handling in chatMainScript).

const LEVEL_LABEL: Record<string, string> = {
  anon: 'Guest',
  member: 'Member',
  full: 'Trusted member',
  club: 'Club member',
  mod: 'Moderator',
  admin: 'Admin',
};

function joined(createdAt: string): string {
  const t = Date.parse(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Same compact pill as the post byline (views/post.ts) so badges read the same
// everywhere. Colors are per-badge data, not theme tokens.
function badgeRow(label: string, badges: PillBadge[]): string {
  if (!badges.length) return '';
  const pills = badges.map(b =>
    `<span title="${esc(b.description || b.name)}" style="display:inline-flex;align-items:center;gap:4px;background:${esc(b.color)}22;color:var(--text-main);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid ${esc(b.color)}66;">${renderBadgeIcon(b.icon)} ${esc(b.name)}</span>`,
  ).join('');
  return `<span style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;"><strong class="cnm-label" style="padding:0;">${label}</strong>${pills}</span>`;
}

const ICON = {
  mention: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
  dm: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  profile: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  ignore: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
  block: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>',
  report: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  purge: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
};

export function renderChatUserMenu(p: {
  target: User;
  badges: Badge[];
  viewer: User;
  viewerIsMod: boolean;
  blocked: boolean;
}): string {
  const { target, badges, viewer, viewerIsMod, blocked } = p;
  const name = target.display_name || `user${target.id}`;
  const nameEsc = esc(name);
  const nameUrl = encodeURIComponent(name);
  const self = target.id === viewer.id;

  const avatar = target.avatar_url
    ? `<span class="cnm-av"><img src="${esc(target.avatar_url)}" alt=""></span>`
    : `<span class="cnm-av" style="background:${esc(target.avatar_color || '#6366f1')}">${esc(initials(name))}</span>`;

  const badgeHtml = badges.length ? `<div class="cnm-badges">${badgeRow('Badges', badges)}</div>` : '';

  const meta = [LEVEL_LABEL[target.access_level] ?? '', joined(target.created_at) ? `joined ${joined(target.created_at)}` : '']
    .filter(Boolean).join(' · ');

  const card = `
  <div class="cnm-card">
    <div class="cnm-who">${avatar}<div style="min-width:0;"><div class="cnm-name">${nameEsc}</div><div class="cnm-meta">${esc(meta)}</div></div></div>
    ${badgeHtml}
  </div>`;

  const profileLink = `<a class="cnm-item" role="menuitem" href="/u/${nameUrl}" hx-get="/u/${nameUrl}" hx-target=".main" hx-push-url="true" data-nick-act="close">${ICON.profile}View profile<span class="cnm-kb">/whois</span></a>`;

  if (self) {
    return `${card}<div class="cnm-items">${profileLink}</div>`;
  }

  const canDm = (viewer.access_level === 'admin' || target.allow_dms !== 0) && !blocked;
  const items = [
    `<button type="button" class="cnm-item" role="menuitem" data-nick-act="mention" data-nick="${nameEsc}">${ICON.mention}Mention<span class="cnm-kb">@</span></button>`,
    canDm
      ? `<a class="cnm-item" role="menuitem" href="/dms/${nameUrl}" data-nick-act="close">${ICON.dm}Message<span class="cnm-kb">/msg</span></a>`
      : '',
    profileLink,
    `<button type="button" class="cnm-item" role="menuitem" data-nick-act="ignore" data-nick="${nameEsc}">${ICON.ignore}<span class="cnm-ignore-label">Ignore in chat</span><span class="cnm-kb">/ignore</span></button>`,
    `<div class="cnm-sep"></div>`,
    `<button type="button" class="cnm-item danger" role="menuitem" data-nick-act="block" data-nick="${nameEsc}" data-blocked="${blocked ? '1' : '0'}">${ICON.block}<span class="cnm-block-label">${blocked ? 'Unblock' : 'Block'}</span></button>`,
    `<button type="button" class="cnm-item danger" role="menuitem" hx-get="/report/form?type=user&id=${target.id}" hx-target="#report-slot-user-${target.id}" hx-swap="innerHTML">${ICON.report}Report</button>`,
    `<div class="cnm-slot">${renderReportSlot('user', target.id)}</div>`,
  ];
  if (viewerIsMod) {
    items.push(
      `<div class="cnm-sep"></div><div class="cnm-label">Moderator</div>`,
      `<button type="button" class="cnm-item" role="menuitem" data-nick-act="purge" data-nick="${nameEsc}">${ICON.purge}Delete their messages here</button>`,
      // Mods can open the users section (requireMod); the per-user edit drawer
      // is admin-only, so link the filtered list rather than the drawer.
      `<a class="cnm-item" role="menuitem" href="/admin?section=users&amp;status=all&amp;q=${nameUrl}" data-nick-act="close">${ICON.shield}Mod notes &amp; ban…</a>`,
    );
  }
  return `${card}<div class="cnm-items">${items.join('')}</div>`;
}

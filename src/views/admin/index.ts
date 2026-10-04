import { esc } from '../layout';
import { isAdmin } from '../../access';
import { renderModQueue, renderDeletedContent, renderModWarnings, renderModReports } from '../mod';
import { renderUsers, renderUserEditDrawer } from './users';
import type { UserListStatus } from './users';
import { renderBadges } from './badges';
import { renderRooms, renderAccess } from './rooms';
import { renderWarnings } from './cw-tags';
import { renderLogs } from './logs';
import { renderSettings } from './settings';
import { renderActivity } from './activity';
import type { CwTag, Room, Setting, User, Topic, Post, ModLog, BanAppeal, ModWarningThread } from '../../types';
import type { ActivityEvent, DeletedPost, DeletedTopic, ArchivedPost } from '../../db';
import type { ReportRow } from '../../db/reports';

export { renderUserEditDrawer } from './users';
export type { UserListStatus } from './users';

export type AdminSection =
  | 'people'
  | 'spaces'
  | 'safety'
  | 'system'
  | 'settings'
  | 'rooms'
  | 'users'
  | 'moderation'
  | 'logs'
  | 'badges'
  | 'stats'
  | 'access'
  | 'warnings'
  | 'activity';

export function renderAdmin(opts: {
  user: User;
  rooms: Room[];
  allRooms: Room[];
  settings: Setting[];
  users: User[];
  userCounts?: { active: number; pending: number; total: number };
  userStatus?: UserListStatus;
  logs?: any[];
  badges?: any[];
  cwTags?: CwTag[];
  stats?: any;
  csrfToken?: string;
  section?: AdminSection;
  tab?: string;
  activityRows?: ActivityEvent[];
  activityActor?: number;
  activityCat?: string;
  pendingQuestionTopics?: Topic[];
  pendingQuestionPosts?: Post[];
  modLogs?: ModLog[];
  openAppeals?: BanAppeal[];
  warningCounts?: { total: number; unresolved: number };
  openReportCount?: number;
  deletedPosts?: DeletedPost[];
  deletedTopics?: DeletedTopic[];
  archivedPosts?: ArchivedPost[];
  warningThreads?: ModWarningThread[];
  reports?: ReportRow[];
}): string {
  const section = opts.section || 'system';
  const tab = opts.tab || defaultAdminTab(section);
  const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
  const viewerIsAdmin = isAdmin(opts.user);
  // Builds class + optional title attribute for a pill; kept as one helper so
  // locked/active never fight over who owns the closing quote.
  const pillAttrs = (isActive: boolean, locked: boolean) =>
    `class="${isActive ? 'active' : ''}${locked ? ' locked' : ''}"${locked ? ' title="Admin only"' : ''}`;

  const sidebar = `
    <nav class="admin-nav">
      <a href="/admin?section=people&tab=users" hx-get="/admin?section=people&tab=users" hx-target=".main" hx-push-url="true" ${pillAttrs(section === 'people', false)}>👥 People</a>
      <a href="/admin?section=spaces&tab=rooms" hx-get="/admin?section=spaces&tab=rooms" hx-target=".main" hx-push-url="true" ${pillAttrs(section === 'spaces', !viewerIsAdmin)}>🏠 Spaces</a>
      <a href="/admin?section=safety&tab=warnings" hx-get="/admin?section=safety&tab=warnings" hx-target=".main" hx-push-url="true" ${pillAttrs(section === 'safety', !viewerIsAdmin)}>⚠️ Safety</a>
      <a href="/admin?section=system&tab=activity" hx-get="/admin?section=system&tab=activity" hx-target=".main" hx-push-url="true" ${pillAttrs(section === 'system', !viewerIsAdmin)}>⚙️ System</a>
      <a href="/admin?section=moderation&tab=queue" hx-get="/admin?section=moderation&tab=queue" hx-target=".main" hx-push-url="true" ${pillAttrs(section === 'moderation', false)}>🛡️ Moderation</a>
      <a href="/admin/intake" hx-get="/admin/intake" hx-target=".main" hx-push-url="true"><!--extb-ui-->Membership intake<!--/extb-ui--></a>
      ${viewerIsAdmin ? '<a href="/admin/membership-settings" hx-get="/admin/membership-settings" hx-target=".main" hx-push-url="true">Membership settings</a><a href="/admin/invitations">Invitations</a><a href="/admin/tokens">MCP tokens</a>' : ''}
    </nav>

    <style>
      .admin-nav {
        display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 20px;
        scrollbar-width: none; -ms-overflow-style: none;
      }
      .admin-nav::-webkit-scrollbar { display: none; }
      .admin-nav a {
        white-space: nowrap; padding: 8px 16px; border-radius: 20px;
        background: var(--bg-color); border: 1.5px solid var(--border-color);
        color: var(--text-muted); font-size: 13px; font-weight: 700; text-decoration: none;
        transition: all 0.2s;
      }
      .admin-nav a:active { transform: scale(0.95); }
      .admin-nav a.active { background: var(--primary); color: #fff; border-color: var(--primary); }
      .admin-nav a.locked { opacity: 0.55; }

      @media (max-width: 768px) {
        .admin-nav { padding: 12px 16px; margin: 0; background: var(--card-bg); border-bottom: 1px solid var(--border-color); }
        .page-title { display: none; }
      }
    </style>
  `;

  let content = '';
  switch (section) {
    case 'people':
      content = renderTabbedSection('people', tab, [
        ['users', 'Users'],
        ['badges', 'Badges'],
      ], tab === 'badges' ? renderBadges(opts) : renderUsers({ ...opts, viewerIsAdmin }));
      break;
    case 'spaces':
      content = viewerIsAdmin
        ? renderTabbedSection('spaces', tab, [
            ['rooms', 'Rooms'],
            ['access', 'Room Access'],
          ], tab === 'access' ? renderAccess(opts) : renderRooms(opts))
        : renderLockedSection('Room management is admin-only.');
      break;
    case 'safety':
      content = viewerIsAdmin
        ? renderTabbedSection('safety', tab, [
            ['warnings', 'Content Warnings'],
          ], `${renderWarnings(opts)}<p style="margin-top:16px;"><a class="btn btn-secondary" href="/admin?section=moderation&tab=queue" hx-get="/admin?section=moderation&tab=queue" hx-target=".main" hx-push-url="true">Open moderation queue</a></p>`)
        : renderLockedSection('Content-warning tag definitions are admin-only.');
      break;
    case 'system':
      content = viewerIsAdmin
        ? renderTabbedSection('system', tab, [
            ['activity', 'Activity'],
            ['logs', 'Audit Logs'],
            ['settings', 'Advanced Settings'],
          ], tab === 'logs' ? renderLogs(opts) : tab === 'settings' ? renderSettings(opts) : renderActivity(opts))
        : renderLockedSection('System settings are admin-only.');
      break;
    case 'moderation': {
      const modBody = tab === 'reports'
        ? renderModReports({ user: opts.user, rooms: opts.rooms, reports: opts.reports ?? [], csrfToken: opts.csrfToken })
        : tab === 'warnings'
        ? renderModWarnings({ user: opts.user, rooms: opts.rooms, warnings: opts.warningThreads ?? [], csrfToken: opts.csrfToken })
        : tab === 'deleted'
        ? renderDeletedContent(opts.deletedPosts ?? [], opts.deletedTopics ?? [], opts.archivedPosts ?? [], opts.csrfToken ?? '')
        : renderModQueue({
            user: opts.user,
            rooms: opts.rooms,
            pendingQuestionTopics: opts.pendingQuestionTopics ?? [],
            pendingQuestionPosts: opts.pendingQuestionPosts ?? [],
            modLogs: opts.modLogs ?? [],
            openAppeals: opts.openAppeals ?? [],
            warnings: opts.warningCounts ?? { total: 0, unresolved: 0 },
            openReportCount: opts.openReportCount ?? 0,
            csrfToken: opts.csrfToken,
          });
      content = renderTabbedSection('moderation', tab, [
        ['queue', 'Queue'],
        ['reports', 'Reports'],
        ['warnings', 'Warnings'],
        ['deleted', 'Deleted Content'],
      ], modBody);
      break;
    }
    case 'settings': content = renderSettings(opts); break;
    case 'rooms': content = renderRooms(opts); break;
    case 'users': content = renderUsers({ ...opts, viewerIsAdmin }); break;
    case 'logs': content = renderLogs(opts); break;
    case 'badges': content = renderBadges(opts); break;
    case 'access': content = renderAccess(opts); break;
    case 'warnings': content = renderWarnings(opts); break;
    case 'activity': content = renderActivity(opts); break;
    default: content = viewerIsAdmin ? renderActivity(opts) : renderLockedSection('Admin only.'); break;
  }

  return `
    <div class="admin-wrap">
      <div class="admin-hd">
        <h1>Admin: ${sectionLabel}</h1>
      </div>
      ${sidebar}
      <div class="admin-ui">
        ${content}
      </div>
    </div>

    <!-- Global Delete Modal -->
    <div id="admin-modal" class="modal-overlay" onclick="if(event.target===this) this.style.display='none'">
      <div class="modal-card">
        <h3 id="modal-title">Confirm Action</h3>
        <p id="modal-body">Are you sure you want to proceed?</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('admin-modal').style.display='none'">Cancel</button>
          <button id="modal-confirm" class="btn btn-danger">Confirm</button>
        </div>
      </div>
    </div>

    <!-- Edit drawer injection target (Edit button hx-target) -->
    <div id="admin-edit-modal-container"></div>
  `;
}

function defaultAdminTab(section: AdminSection): string {
  switch (section) {
    case 'people': return 'users';
    case 'spaces': return 'rooms';
    case 'safety': return 'warnings';
    case 'system': return 'activity';
    case 'moderation': return 'queue';
    default: return String(section);
  }
}

// Placeholder body for a mod-visible pill whose section is entirely
// admin-gated. Never called with the section's real data - the caller must
// branch on viewerIsAdmin before even fetching/rendering that content.
function renderLockedSection(message: string): string {
  return `<div class="card admin-locked" style="padding:32px;text-align:center;color:var(--text-muted);" title="Admin only">🔒 ${esc(message)}</div>`;
}

function renderTabbedSection(section: string, active: string, tabs: Array<[string, string]>, body: string): string {
  return `
    <nav class="admin-tabs">
      ${tabs.map(([id, label]) => `
        <a href="/admin?section=${section}&tab=${id}" hx-get="/admin?section=${section}&tab=${id}" hx-target=".main" hx-push-url="true" class="${active === id ? 'active' : ''}">${label}</a>
      `).join('')}
    </nav>
    ${body}
    <style>
      .admin-tabs { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 20px; }
      .admin-tabs a { padding:8px 14px; border:1px solid var(--border-color); border-radius:8px; color:var(--text-muted); text-decoration:none; font-weight:700; font-size:13px; background:var(--card-bg); }
      .admin-tabs a.active { background:var(--primary); border-color:var(--primary); color:#fff; }
    </style>
  `;
}

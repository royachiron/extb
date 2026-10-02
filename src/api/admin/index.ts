import type { AccessLevel, AppContext, MinPostGate, MinReadGate, RoomKind } from '../../types';
import { requireAdmin, requireMod } from '../../middleware';
import { isAdmin } from '../../access';
import { seedIfNeeded } from '../../seed';
import {
  getAllSettings,
  setSetting,
  listRooms,
  getRoomById,
  getRoomBySlug,
  createRoom,
  updateRoomPartial,
  deleteRoom,
  getRecentUsers,
  getUserCounts,
  type UserListStatus,
  type UserSort,
  setUserAccess,
  setUserBanned,
  setUserReviewStatus,
  updateUserPartial,
  deleteAllSessionsForUser,
  updateModNote,
  logAdminAction,
  getAuditLogs,
  createBadge,
  assignBadge,
  listAllBadges,
  getUsersByDisplayNames,
  getUserById,
  createModLog,
  listSaltMigrationTargets,
  setReviewNotes,
  anonymizeUser,
  createCwTag,
  updateCwTag,
  deleteCwTag,
  setTopicCwTags,
  setPostCwTags,
  listCwTags,
  listActivityFeed,
  grantCapability,
  revokeCapability,
  listBadgesForUser,
  removeUserBadge,
  listPendingQuestions,
  listPendingQuestionPosts,
  listModLogs,
  listOpenBanAppeals,
  countWarnings,
  countOpenReports,
  listDeletedPosts,
  listDeletedTopics,
  listArchivedPosts,
  listAllWarningsWithReplies,
  listOpenReports,
  getForumViewStats,
} from '../../db';
import { renderAdmin, AdminSection } from '../../views/admin';
import { renderLayout } from '../../views/layout';
import { sendSaltUpgradeEmail, sendBanEmail } from '../../email';

import { normalizeAdminLocation } from './shared';

export * from './shared';
export * from './settings';
export * from './rooms';
export * from './users';
export * from './badges';
export * from './cw-tags';

export async function getSetup(
  _req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  requireAdmin(ctx);
  const result = await seedIfNeeded(ctx.env);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function getAdminPanel(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMod(ctx);
  const viewerIsAdmin = isAdmin(user);
  const url = new URL(req.url);
  const { section, tab } = normalizeAdminLocation(url.searchParams.get('section'), url.searchParams.get('tab'));

  const rawStatus = url.searchParams.get('status');
  const actionFilter = url.searchParams.get('action') || undefined;
  const q = url.searchParams.get('q')?.trim() || undefined;
  const userStatus: UserListStatus =
    rawStatus === 'pending' || rawStatus === 'all' || rawStatus === 'active'
      ? rawStatus
      : 'active';
  const rawSort = url.searchParams.get('sort');
  const sort: UserSort =
    rawSort === 'name' || rawSort === 'role' || rawSort === 'active' || rawSort === 'recent'
      ? rawSort
      : 'recent';
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0);
  const PAGE_SIZE = 100;
  const userFilter = {
    role: (url.searchParams.get('role') || undefined) as 'member' | 'full' | 'mod' | 'admin' | undefined,
    banned: url.searchParams.get('banned') === '1',
    unverified: url.searchParams.get('unverified') === '1',
    review: url.searchParams.get('review') === '1',
  };
  const activityActor = Number(url.searchParams.get('actor')) || undefined;
  const activityCat = url.searchParams.get('cat') || undefined;

  const wantModQueue = section === 'moderation' && tab !== 'reports' && tab !== 'warnings' && tab !== 'deleted';

  const [
    settings, allRooms, users, userCounts, logs, stats, badges, cwTags, activityRows,
    pendingQuestionTopics, pendingQuestionPosts, modLogs, openAppeals, warningCounts, openReportCount,
    deletedPosts, deletedTopics, archivedPosts, warningThreads, reports,
  ] = await Promise.all([
    getAllSettings(ctx.env),
    listRooms(ctx.env),
    section === 'people' && tab === 'users'
      ? (q
          ? (await import('../../db')).searchUsers(ctx.env, q, PAGE_SIZE, sort, userFilter, page * PAGE_SIZE)
          : getRecentUsers(ctx.env, PAGE_SIZE, userStatus, sort, userFilter, page * PAGE_SIZE))
      : Promise.resolve([]),
    section === 'people' && tab === 'users' ? getUserCounts(ctx.env) : Promise.resolve({ active: 0, pending: 0, total: 0 }),
    viewerIsAdmin && section === 'system' && tab === 'logs' ? getAuditLogs(ctx.env, 100, actionFilter) : Promise.resolve([]),
    viewerIsAdmin && section === 'system' && tab === 'activity' ? getForumViewStats(ctx.env) : Promise.resolve(null),
    section === 'people' && tab === 'badges' ? listAllBadges(ctx.env) : Promise.resolve([]),
    viewerIsAdmin && section === 'safety' && tab === 'warnings' ? listCwTags(ctx.env, true) : Promise.resolve([]),
    viewerIsAdmin && section === 'system' && tab === 'activity' ? listActivityFeed(ctx.env, 150) : Promise.resolve([]),
    wantModQueue ? listPendingQuestions(ctx.env) : Promise.resolve([]),
    wantModQueue ? listPendingQuestionPosts(ctx.env) : Promise.resolve([]),
    wantModQueue ? listModLogs(ctx.env) : Promise.resolve([]),
    wantModQueue ? listOpenBanAppeals(ctx.env) : Promise.resolve([]),
    wantModQueue ? countWarnings(ctx.env) : Promise.resolve({ total: 0, unresolved: 0 }),
    wantModQueue ? countOpenReports(ctx.env) : Promise.resolve(0),
    section === 'moderation' && tab === 'deleted' ? listDeletedPosts(ctx.env, 50, 0) : Promise.resolve([]),
    section === 'moderation' && tab === 'deleted' ? listDeletedTopics(ctx.env, 50, 0) : Promise.resolve([]),
    section === 'moderation' && tab === 'deleted' ? listArchivedPosts(ctx.env, 50, 0) : Promise.resolve([]),
    section === 'moderation' && tab === 'warnings' ? listAllWarningsWithReplies(ctx.env) : Promise.resolve([]),
    section === 'moderation' && tab === 'reports' ? listOpenReports(ctx.env) : Promise.resolve([]),
  ]);

  const html = renderAdmin({
    user,
    rooms: allRooms,
    allRooms,
    settings,
    users,
    userCounts,
    userStatus,
    logs,
    stats,
    badges,
    cwTags,
    activityRows,
    activityActor,
    activityCat,
    pendingQuestionTopics,
    pendingQuestionPosts,
    modLogs,
    openAppeals,
    warningCounts,
    openReportCount,
    deletedPosts,
    deletedTopics,
    archivedPosts,
    warningThreads,
    reports,
    csrfToken: ctx.csrfToken,
    section,
    tab,
    actionFilter,
    q,
    sort,
    page,
    pageSize: PAGE_SIZE,
    filter: userFilter,
  } as any);

  // Handle HTMX partial navigation - swap into .main to prevent nesting
  if (req.headers.get('HX-Request')) {
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  return new Response(
    renderLayout({
      branding: ctx.branding,
      origin: ctx.origin,
      uploadsEnabled: !!ctx.env.MEDIA,
      user,
      rooms: allRooms,
      activeRoomSlug: 'admin',
      title: `Admin - ${section.charAt(0).toUpperCase() + section.slice(1)}`,
      body: html,
      csrfToken: ctx.csrfToken,
      showFab: false,
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

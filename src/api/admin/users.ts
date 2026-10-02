import type { AccessLevel, AppContext, MinPostGate, MinReadGate, RoomKind, User } from '../../types';
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
  getUserByEmail,
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
} from '../../db';
import { renderAdmin, AdminSection } from '../../views/admin';
import { renderLayout } from '../../views/layout';
import {
  sendSaltUpgradeEmail,
  sendBanEmail,
} from '../../email';

import { bad, redirectAdmin, isOneOf, VALID_ACCESS } from './shared';
import { runAdminOperation } from '../../lib/admin-operations';
import { SCOPES } from '../../mcp/auth';

export async function postSetUserAccess(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const level = String(f.get('access_level') ?? '');
  if (!Number.isInteger(user_id) || user_id <= 0) return bad('invalid user_id');
  if (!isOneOf(level, VALID_ACCESS)) return bad('invalid access_level');
  const result = await runAdminOperation(ctx.env, {id:user.id,tokenId:null,scopes:[...SCOPES]}, 'set_member_access', {id:user_id,access:level}) as {changed:number};
  if (!result.changed) return bad('User not found or cannot demote the last active administrator');
  return redirectAdmin(req, 'User access updated.', 'users');
}

export async function postSetUserClub(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const userId = Number(f.get('user_id'));
  const enabled = String(f.get('club') ?? '') === '1';
  const note = String(f.get('note') ?? '').trim() || null;
  if (!Number.isInteger(userId) || userId <= 0) return bad('invalid user_id');
  if (enabled) await grantCapability(ctx.env, userId, 'club', admin.id, note);
  else await revokeCapability(ctx.env, userId, 'club');
  await logAdminAction(ctx.env, admin.id, enabled ? 'grant_club' : 'revoke_club', `user=${userId}`);
  return redirectAdmin(req, enabled ? 'Club capability granted.' : 'Club capability revoked.', 'users');
}

export async function postSetUserBanned(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const raw = String(f.get('is_banned') ?? '');
  const reason = String(f.get('reason') ?? '').trim();
  if (!Number.isInteger(user_id) || user_id <= 0) return bad('invalid user_id');
  const banned: 0 | 1 = raw === '1' ? 1 : 0;

  const target = await getUserById(ctx.env, user_id);
  if (!target) return bad('user not found');

  const result = await runAdminOperation(ctx.env, {id:admin.id,tokenId:null,scopes:[...SCOPES]}, 'set_member_ban', {id:user_id,banned:banned===1,reason}) as {changed:number};
  if (!result.changed) return bad('Cannot ban the last active administrator');

  return redirectAdmin(req, banned ? 'User banned.' : 'User unbanned.', 'users');
}

export async function postSetUserReview(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const review = f.get('require_review') === '1' ? 1 : 0;

  if (!user_id) return bad('user_id required');
  await setUserReviewStatus(ctx.env, user_id, review);
  await logAdminAction(ctx.env, admin.id, 'set_user_review', `user=${user_id} review=${review}`);
  return redirectAdmin(req, 'User review status updated.', 'users');
}

export async function postDeleteUser(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  if (!Number.isInteger(user_id) || user_id <= 0) return bad('invalid user_id');
  if (user_id === admin.id) return bad('cannot delete your own account');
  const noBan = f.get('no_ban') === '1';
  await anonymizeUser(ctx.env, user_id, !noBan);
  await logAdminAction(ctx.env, admin.id, 'delete_user', `user=${user_id}${noBan ? ' no_ban' : ''}`);
  if (req.headers.get('HX-Request')) {
    const back = req.headers.get('HX-Current-URL') ?? '/admin?section=users';
    return new Response(null, { status: 200, headers: { 'HX-Redirect': back } });
  }
  const ref = req.headers.get('referer') || '';
  if (ref.includes('/u/')) {
    return new Response(null, { status: 303, headers: { Location: '/users' } });
  }
  return new Response(null, { status: 303, headers: { Location: '/admin?section=users' } });
}

export async function getAdminUserEdit(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  requireAdmin(ctx);
  const id = Number(params.id);
  if (!id) return new Response('invalid id', { status: 400 });
  
  const target = await getUserById(ctx.env, id);
  if (!target) return new Response('user not found', { status: 404 });

  const [userBadges, allBadgesData] = await Promise.all([
    listBadgesForUser(ctx.env, id),
    listAllBadges(ctx.env),
  ]);
  const { renderUserEditDrawer } = await import('../../views/admin');
  const body = renderUserEditDrawer(target, ctx.csrfToken, userBadges, allBadgesData);
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function drawerHtml(ctx: AppContext, userId: number): Promise<string | null> {
  const target = await getUserById(ctx.env, userId);
  if (!target) return null;
  const [userBadges, allBadgesData] = await Promise.all([
    listBadgesForUser(ctx.env, userId),
    listAllBadges(ctx.env),
  ]);
  const { renderUserEditDrawer } = await import('../../views/admin');
  return renderUserEditDrawer(target, ctx.csrfToken, userBadges, allBadgesData);
}

export async function postUpdateUser(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  if (!Number.isInteger(user_id) || user_id <= 0) return bad('invalid user_id');

  const partial: Record<string, any> = {};
  const allowed = [
    'display_name', 'bio', 'pronouns', 'twitter_url', 'website_url', 
    'signature', 'avatar_color', 'timezone', 'mod_note'
  ];

  for (const key of allowed) {
    const val = f.get(key);
    if (val !== null) {
      partial[key] = String(val).trim();
    }
  }

  // Handle checkboxes separately (unchecked sends nothing → must coerce here, NOT in the allowed[] text loop)
  partial.hide_activity = f.get('hide_activity') === '1' ? 1 : 0;
  partial.hide_bio = f.get('hide_bio') === '1' ? 1 : 0;
  partial.show_nsfw = f.get('show_nsfw') === '1' ? 1 : 0;
  partial.allow_dms = f.get('allow_dms') === '1' ? 1 : 0;

  if (f.get('remove_avatar') === '1') partial.avatar_url = null;
  if (f.get('remove_cover') === '1') partial.cover_image = null;

  await updateUserPartial(ctx.env, user_id, partial);
  await logAdminAction(ctx.env, admin.id, 'admin_update_user', `user=${user_id} fields=${Object.keys(partial).join(',')}`);
  
  return redirectAdmin(req, 'User profile updated.', 'users');
}

export async function postEditModNote(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const note = String(f.get('mod_note') ?? '');
  if (!user_id || !note) return bad('invalid input');
  await updateModNote(ctx.env, user_id, note);
  await logAdminAction(ctx.env, user.id, 'update_user_note', `user=${user_id}`);
  return redirectAdmin(req, 'User note saved.', 'users');
}

// One-off salt-migration email blast. Admin-only POST. Idempotent via
// mod_logs: emails users with password_salt IS NULL AND email_verified = 1
// AND NOT EXISTS(mod_logs row with action=salt_migration_email,target_id=u.id).
// Each send writes a mod_logs row so re-running is safe. Dry-run mode
// available via ?dry=1.
export async function postSaltMigrationBlast(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  const rows = await listSaltMigrationTargets(ctx.env);
  if (dry) {
    return new Response(
      JSON.stringify({ mode: 'dry', would_send: rows.length, sample: rows.slice(0, 5).map(r => r.email) }, null, 2),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (const row of rows) {
    try {
      await sendSaltUpgradeEmail(ctx.env, row.email);
      await createModLog(ctx.env, admin.id, 'salt_migration_email', 'user', row.id, row.email);
      sent++;
    } catch (e) {
      failed++;
      errors.push({ email: row.email, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await logAdminAction(
    ctx.env,
    admin.id,
    'salt_migration_blast',
    `sent=${sent} failed=${failed}`,
  );

  return new Response(
    JSON.stringify({ sent, failed, errors }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// ─── Content-Warning Tag admin handlers ────────────────────────────────────

export async function postReviewerNotes(req: Request, ctx: AppContext, params: Record<string, string>): Promise<Response> {
  const user = ctx.user;
  if (!user || !['mod', 'admin'].includes(user.access_level)) return new Response('forbidden', { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return bad('invalid id');
  const f = await req.formData();
  const notes = String(f.get('notes') ?? '').slice(0, 2000);
  await setReviewNotes(ctx.env, id, notes);
  await logAdminAction(ctx.env, user.id, 'reviewer_notes', `user=${id} len=${notes.length}`);
  return new Response(null, { status: 204 });
}

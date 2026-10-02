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
} from '../../db';
import { renderAdmin, AdminSection } from '../../views/admin';
import { renderLayout } from '../../views/layout';
import { sendSaltUpgradeEmail, sendBanEmail } from '../../email';

import { bad, redirectAdmin } from './shared';
import { drawerHtml } from './users';
import { runAdminOperation } from '../../lib/admin-operations';
import { SCOPES } from '../../mcp/auth';

function normalizeHex(v: string, fallback: string): string {
  const s = (v || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : fallback;
}

export async function postCreateBadge(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const name = String(f.get('name') ?? '').trim();
  const icon = String(f.get('icon') ?? '').trim();
  const color = normalizeHex(String(f.get('color') ?? ''), '#6366f1');
  const textColor = normalizeHex(String(f.get('text_color') ?? ''), '#ffffff');
  const shape = 'pill';
  const desc = String(f.get('description') ?? '').trim();

  if (!name || !icon) return bad('name and icon required');
  await runAdminOperation(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'create_badge',{name,icon,color,text_color:textColor,description:desc});
  return redirectAdmin(req, `Badge "${name}" created.`, 'badges');
}

export async function postUpdateBadge(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const id = Number(params.id);
  if (!id) return bad('id required');
  const f = await req.formData();
  const name = String(f.get('name') ?? '').trim();
  const icon = String(f.get('icon') ?? '').trim();
  const color = normalizeHex(String(f.get('color') ?? ''), '#6366f1');
  const textColor = normalizeHex(String(f.get('text_color') ?? ''), '#ffffff');
  const desc = String(f.get('description') ?? '').trim();
  if (!name || !icon) return bad('name and icon required');
  await runAdminOperation(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'update_badge',{id,name,icon,color,text_color:textColor,description:desc});
  return redirectAdmin(req, `Badge "${name}" updated.`, 'badges');
}

export async function postDeleteBadge(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const id = Number(params.id);
  if (!id) return bad('id required');
  const { deleteBadge } = await import('../../db');
  await deleteBadge(ctx.env, id);
  await logAdminAction(ctx.env, user.id, 'delete_badge', `id=${id}`);
  return redirectAdmin(req, `Badge deleted.`, 'badges');
}

export async function postAssignBadge(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const badge_id = Number(f.get('badge_id'));
  const status = (f.get('status') as string) === 'need' ? 'need' : 'have';

  if (!user_id || !badge_id) return bad('user_id and badge_id required');
  await runAdminOperation(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'assign_badge',{user_id,badge_id,status,assigned:true});
  return redirectAdmin(req, 'Badge assigned.', 'badges');
}

export async function postAdminBadgeAssign(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const badge_id = Number(f.get('badge_id'));
  const status = (f.get('status') as string) === 'need' ? 'need' : 'have';

  if (!user_id || !badge_id) return bad('user_id and badge_id required');
  await runAdminOperation(ctx.env,{id:admin.id,tokenId:null,scopes:[...SCOPES]},'assign_badge',{user_id,badge_id,status,assigned:true});

  const body = await drawerHtml(ctx, user_id);
  if (!body) return new Response('user not found', { status: 404 });
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function postAdminBadgeRemove(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = requireAdmin(ctx);
  const f = await req.formData();
  const user_id = Number(f.get('user_id'));
  const badge_id = Number(f.get('badge_id'));

  if (!user_id || !badge_id) return bad('user_id and badge_id required');
  await runAdminOperation(ctx.env,{id:admin.id,tokenId:null,scopes:[...SCOPES]},'assign_badge',{user_id,badge_id,assigned:false});

  const body = await drawerHtml(ctx, user_id);
  if (!body) return new Response('user not found', { status: 404 });
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

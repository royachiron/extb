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

import { bad, redirectAdmin, isOneOf, isValidSlug, isValidRoomKind, VALID_MIN_READ, VALID_MIN_POST } from './shared';
import { runAdminOperation } from '../../lib/admin-operations';
import { SCOPES } from '../../mcp/auth';

export async function postCreateRoom(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const name = String(f.get('name') ?? '').trim();
  const slug = String(f.get('slug') ?? '').trim();
  const description = String(f.get('description') ?? '').trim() || null;
  const icon = String(f.get('icon') ?? '').trim() || null;
  const kind = String(f.get('kind') ?? '');
  const min_read = String(f.get('min_read') ?? 'anon');
  const min_post = String(f.get('min_post') ?? 'member');
  const is_locked: 0 | 1 = f.get('is_locked') === '1' ? 1 : 0;
  const is_page: 0 | 1 = f.get('is_page') === '1' ? 1 : 0;
  const sort_order = Number(f.get('sort_order') ?? 0) | 0;
  const is_exclusive: 0 | 1 = f.get('is_exclusive') === '1' ? 1 : 0;

  if (!name) return bad('name required');
  if (!isValidSlug(slug)) return bad('invalid slug (lowercase a-z 0-9 -, 2-32 chars)');
  if (!isValidRoomKind(kind)) return bad('invalid kind');
  if (!isOneOf(min_read, VALID_MIN_READ)) return bad('invalid min_read');
  if (!isOneOf(min_post, VALID_MIN_POST)) return bad('invalid min_post');

  const existing = await getRoomBySlug(ctx.env, slug);
  if (existing) return bad('slug already exists');

  await runAdminOperation(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'create_room',{name,slug,description:description||'',icon:icon||'',kind,min_read,min_post,sort_order,locked:!!is_locked,page:!!is_page,exclusive:!!is_exclusive});
  return redirectAdmin(req, `Room "${name}" created.`, 'rooms');
}

export async function postUpdateRoom(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (!Number.isInteger(id) || id <= 0) return bad('invalid id');

  const room = await getRoomById(ctx.env, id);
  if (!room) return new Response('not found', { status: 404 });

  const partial: Record<string, unknown> = {};
  if (f.has('name')) partial.name = String(f.get('name') ?? '').trim();
  if (f.has('description')) partial.description = String(f.get('description') ?? '').trim() || null;
  if (f.has('icon')) partial.icon = String(f.get('icon') ?? '').trim() || null;
  if (f.has('min_read')) {
    const minRead = String(f.get('min_read'));
    if (!isOneOf(minRead, VALID_MIN_READ)) return bad('invalid min_read');
    partial.min_read = minRead;
  }
  if (f.has('min_post')) {
    const minPost = String(f.get('min_post'));
    if (!isOneOf(minPost, VALID_MIN_POST)) return bad('invalid min_post');
    partial.min_post = minPost;
  }
  if (f.has('is_locked')) partial.is_locked = f.get('is_locked') === '1' ? 1 : 0;
  if (f.has('is_page')) partial.is_page = f.get('is_page') === '1' ? 1 : 0;
  if (f.has('is_exclusive')) partial.is_exclusive = f.get('is_exclusive') === '1' ? 1 : 0;
  if (f.has('sort_order')) partial.sort_order = Number(f.get('sort_order')) | 0;

  if (Object.keys(partial).length === 0) return bad('no fields to update');
  await updateRoomPartial(ctx.env, id, partial);
  await logAdminAction(ctx.env, user.id, 'update_room', room.slug);
  return redirectAdmin(req, 'Room updated.', 'rooms');
}

export async function postDeleteRoom(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (!Number.isInteger(id) || id <= 0) return bad('invalid id');
  const room = await getRoomById(ctx.env, id);
  if (!room) return new Response('not found', { status: 404 });
  await deleteRoom(ctx.env, id);
  await logAdminAction(ctx.env, user.id, 'archive_room', room.slug);
  return redirectAdmin(req, 'Room archived (content preserved).', 'rooms');
}

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

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const CW_SLUG_RE = /^[a-z0-9-]{2,40}$/;

function parseBool01(v: string | File | null): 0 | 1 {
  return v === '1' || v === 'on' || v === 'true' ? 1 : 0;
}

export async function postCreateCwTag(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const f = await req.formData();
  const slug = String(f.get('slug') ?? '').trim();
  const name = String(f.get('name') ?? '').trim();
  const description = String(f.get('description') ?? '').trim();
  const color = String(f.get('color') ?? '#6b7280').trim();
  const is_spoiler = parseBool01(f.get('is_spoiler'));
  const is_nsfw = parseBool01(f.get('is_nsfw'));
  const sort_order = Number(f.get('sort_order') ?? 0) | 0;
  if (!CW_SLUG_RE.test(slug)) return bad('invalid slug (a-z 0-9 -, 2-40 chars)');
  if (!name) return bad('name required');
  if (!HEX_RE.test(color)) return bad('color must be #rrggbb');
  await createCwTag(ctx.env, { slug, name, description, color, is_spoiler, is_nsfw, sort_order });
  await logAdminAction(ctx.env, user.id, 'create_cw_tag', `${slug}=${name}`);
  return redirectAdmin(req, 'Tag created.', 'warnings');
}

export async function postUpdateCwTag(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return bad('invalid id');
  const f = await req.formData();
  const patch: Record<string, unknown> = {};
  if (f.has('name')) patch.name = String(f.get('name')).trim();
  if (f.has('description')) patch.description = String(f.get('description')).trim();
  if (f.has('color')) {
    const c = String(f.get('color')).trim();
    if (!HEX_RE.test(c)) return bad('color must be #rrggbb');
    patch.color = c;
  }
  if (f.has('is_spoiler')) patch.is_spoiler = parseBool01(f.get('is_spoiler'));
  if (f.has('is_nsfw')) patch.is_nsfw = parseBool01(f.get('is_nsfw'));
  if (f.has('sort_order')) patch.sort_order = Number(f.get('sort_order')) | 0;
  if (f.has('is_archived')) patch.is_archived = parseBool01(f.get('is_archived'));
  await updateCwTag(ctx.env, id, patch);
  await logAdminAction(ctx.env, user.id, 'update_cw_tag', `id=${id}`);
  return redirectAdmin(req, 'Tag updated.', 'warnings');
}

export async function postDeleteCwTag(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return bad('invalid id');
  await deleteCwTag(ctx.env, id);
  await logAdminAction(ctx.env, user.id, 'delete_cw_tag', `id=${id}`);
  return redirectAdmin(req, 'Tag deleted.', 'warnings');
}

// Mod/admin retroactive edit of attached tags on existing content
export async function postSetContentCwTags(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = ctx.user;
  if (!user || (user.access_level !== 'mod' && user.access_level !== 'admin')) {
    return new Response('forbidden', { status: 403 });
  }
  const f = await req.formData();
  const contentType = String(f.get('content_type') ?? '');
  const contentId = Number(f.get('content_id') ?? 0);
  if (!(contentType === 'topic' || contentType === 'post')) return bad('invalid content_type');
  if (!Number.isInteger(contentId) || contentId <= 0) return bad('invalid content_id');
  const ids = f.getAll('cw_tag_ids').map(v => Number(v)).filter(n => Number.isInteger(n) && n > 0);
  if (contentType === 'topic') await setTopicCwTags(ctx.env, contentId, ids);
  else await setPostCwTags(ctx.env, contentId, ids);
  await logAdminAction(ctx.env, user.id, 'set_cw_tags', `${contentType}=${contentId} tags=${ids.join(',')}`);
  return new Response(null, { status: 204 });
}

import { HELPER_FIELDS } from '../../lib/bot-copy';
import { verifyCsrf } from '../../middleware';
import { BRANDING_KEYS, saveBranding } from '../../lib/branding';
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

export async function postSetting(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireAdmin(ctx);
  const form = await req.formData();
  const key = String(form.get('key') ?? '').trim();
  const values = form.getAll('value');
  const value = String(values[values.length - 1] ?? '');
  if (!['signups_open', 'bot_enabled'].includes(key)) return bad('Use the dedicated configuration form');
  if (!['0', '1'].includes(value)) return bad('Value must be 0 or 1');

  await setSetting(ctx.env, key, value);
  await logAdminAction(ctx.env, user.id, 'update_setting', `${key}=${value}`);
  const targetSection: AdminSection = 'settings';
  return redirectAdmin(req, 'Setting updated.', targetSection);
}

export async function postBranding(req: Request, ctx: AppContext, _params: Record<string, string>): Promise<Response> {
  const user = requireAdmin(ctx);
  const form = await req.formData();
  const values = Object.fromEntries(BRANDING_KEYS.map(key => [key, String(form.get(key) ?? '')]));
  try { await saveBranding(ctx.env, values); } catch (error) { return bad(error instanceof Error ? error.message : 'Invalid branding'); }
  await logAdminAction(ctx.env, user.id, 'update_branding', 'Community branding updated');
  if (req.headers.get('HX-Request')) return new Response(null, { status: 204, headers: { 'HX-Refresh': 'true' } });
  return redirectAdmin(req, 'Branding updated.', 'settings');
}

export async function postHelperSettings(req: Request, ctx: AppContext, _params: Record<string, string>): Promise<Response> {
  const user = requireAdmin(ctx);
  await verifyCsrf(req, ctx);
  const form = await req.formData();
  const config = Object.fromEntries(['name', ...HELPER_FIELDS].map(key => [key, String(form.get(key) ?? '').trim()]));
  if (!config.name || config.name.length > 80) return bad('Helper name must be between 1 and 80 characters');
  if (HELPER_FIELDS.some(key => !config[key] || config[key].length > 4000)) return bad('Each guidance field must be between 1 and 4000 characters');
  await setSetting(ctx.env, 'helper_config', JSON.stringify(config));
  await logAdminAction(ctx.env, user.id, 'update_helper_config', 'Community helper guidance updated');
  return redirectAdmin(req, 'Helper guidance updated.', 'settings');
}

// Validators + admin-redirect helpers shared by the api/admin/ modules.
// Split from api/admin.ts; logic byte-identical.
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


// Pure validator - tested in tests/admin-validators.test.ts
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9-]{2,32}$/.test(s);
}

export const VALID_KINDS = ['forum', 'blog', 'news', 'questions', 'chat'] as const;

// Pure validator - tested in tests/admin-validators.test.ts
export function isValidRoomKind(k: string): boolean {
  return (VALID_KINDS as readonly string[]).includes(k);
}
export const VALID_MIN_READ = ['anon', 'member', 'full', 'mod'] as const;
export const VALID_MIN_POST = ['member', 'full', 'mod'] as const;
export const VALID_ACCESS = ['member', 'full', 'mod', 'admin'] as const;

export function isValidMinReadGate(v: string): boolean {
  return (VALID_MIN_READ as readonly string[]).includes(v);
}

export function isValidMinPostGate(v: string): boolean {
  return (VALID_MIN_POST as readonly string[]).includes(v);
}

export function isValidAccessLevel(v: string): boolean {
  return (VALID_ACCESS as readonly string[]).includes(v);
}

export function bad(msg: string): Response {
  return new Response(msg, { 
    status: 400,
    headers: { 'HX-Trigger': JSON.stringify({ toast: { message: msg, type: 'error' } }) }
  });
}

export function isOneOf<T extends readonly string[]>(v: string, list: T): v is T[number] {
  return (list as readonly string[]).includes(v);
}

export function redirectAdmin(req: Request, msg?: string, section?: AdminSection): Response {
  if (req.headers.get('HX-Request')) {
    const headers: Record<string, string> = {};
    if (msg) {
      headers['HX-Trigger'] = JSON.stringify({ toast: { message: msg, type: 'success' } });
    }
    return new Response(null, { status: 204, headers });
  }
  const url = section ? `/admin?section=${section}` : '/admin';
  const headers: Record<string, string> = { Location: url };
  if (msg) {
    headers['HX-Trigger'] = JSON.stringify({ toast: { message: msg, type: 'success' } });
  }
  return new Response(null, { status: 303, headers });
}

export function normalizeAdminLocation(rawSection: string | null, rawTab: string | null): { section: AdminSection; tab: string } {
  switch (rawSection) {
    case 'users': return { section: 'people', tab: 'users' };
    case 'badges': return { section: 'people', tab: 'badges' };
    case 'rooms': return { section: 'spaces', tab: 'rooms' };
    case 'access': return { section: 'spaces', tab: 'access' };
    case 'warnings': return { section: 'safety', tab: 'warnings' };
    case 'activity': return { section: 'system', tab: 'activity' };
    case 'logs': return { section: 'system', tab: 'logs' };
    case 'settings': return { section: 'system', tab: 'settings' };
    case 'people':
      return { section: 'people', tab: rawTab === 'badges' ? 'badges' : 'users' };
    case 'spaces':
      return { section: 'spaces', tab: rawTab === 'access' ? 'access' : 'rooms' };
    case 'safety':
      return { section: 'safety', tab: 'warnings' };
    case 'system':
      return { section: 'system', tab: rawTab === 'logs' || rawTab === 'settings' ? rawTab : 'activity' };
    case 'moderation':
      return {
        section: 'moderation',
        tab: rawTab === 'reports' || rawTab === 'warnings' || rawTab === 'deleted' ? rawTab : 'queue',
      };
    default:
      return { section: 'people', tab: 'users' };
  }
}

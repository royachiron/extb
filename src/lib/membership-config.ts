import type { Env, Setting, Room, User } from '../types';
import { getSetting } from '../db/settings';

export interface MembershipConfig {
  enabled: boolean;
  applicationRoomId: number | null;
  staffUserId: number | null;
  welcomeEnabled: boolean;
  welcomeSenderId: number | null;
  welcomeMessage: string;
  remindersEnabled: boolean;
}
export const DEFAULT_MEMBERSHIP_CONFIG: MembershipConfig = {
  enabled: false, applicationRoomId: null, staffUserId: null,
  welcomeEnabled: false, welcomeSenderId: null, welcomeMessage: '', remindersEnabled: false,
};
export function membershipConfigFromSettings(settings: Setting[]): MembershipConfig {
  const value = settings.find(s => s.key === 'membership_config')?.value;
  if (!value) return { ...DEFAULT_MEMBERSHIP_CONFIG };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_MEMBERSHIP_CONFIG };
    return {
      enabled: parsed.enabled === true,
      applicationRoomId: positiveId(parsed.applicationRoomId), staffUserId: positiveId(parsed.staffUserId),
      welcomeEnabled: parsed.welcomeEnabled === true, welcomeSenderId: positiveId(parsed.welcomeSenderId),
      welcomeMessage: typeof parsed.welcomeMessage === 'string' ? parsed.welcomeMessage.slice(0, 4000) : '',
      remindersEnabled: parsed.remindersEnabled === true,
    };
  }
  catch { return { ...DEFAULT_MEMBERSHIP_CONFIG }; }
}
export async function loadMembershipConfig(env: Env): Promise<MembershipConfig> {
  const setting = await getSetting(env, 'membership_config');
  return membershipConfigFromSettings(setting ? [setting] : []);
}

function positiveId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}
export function applicationRoomEligible(room: Room | null): boolean {
  return !!room && !(room as Room & { is_archived?: number }).is_archived && room.kind === 'forum' && !room.is_page && !room.is_exclusive && !room.is_locked
    && ['anon', 'member'].includes(room.min_read) && ['anon', 'member'].includes(room.min_post);
}
export function welcomeSenderEligible(user: User | null): boolean {
  return !!user && !!user.is_approved && !user.is_banned && !!user.display_name?.trim()
    && !user.posting_restricted_at && !['applicant', 'pending', 'declined'].includes((user as User & { intake_status?: string }).intake_status ?? 'none');
}
export function staffContactEligible(user: User | null): boolean {
  return !!user && !!user.is_approved && !user.is_banned && !!user.display_name?.trim() && user.allow_dms !== 0
    && (user.access_level === 'mod' || user.access_level === 'admin');
}

import type { Env, User } from '../types';
import { loadMembershipConfig } from './membership-config';

/** Only accounts explicitly enrolled in intake are restricted. Existing members stay unchanged. */
export function isIntakeRestricted(user: User | null): boolean {
  return !!user?.intake_gate_active && ['applicant', 'pending', 'declined'].includes(user.intake_status ?? 'none');
}
export async function decorateMembershipUser(env: Env, user: User | null): Promise<User | null> {
  if (!user) return null;
  const config = await loadMembershipConfig(env);
  return { ...user, intake_gate_active: config.enabled, intake_application_room_id: config.applicationRoomId, intake_staff_user_id: config.staffUserId };
}
export async function newUserIntakeStatus(env: Env): Promise<'applicant' | 'none'> {
  return (await loadMembershipConfig(env)).enabled ? 'applicant' : 'none';
}
/** Intake and moderator suspension are independent; configured staff must remain active. */
export function canSendMemberDm(sender: User, recipient: User): boolean {
  if (sender.is_banned || !sender.is_approved || recipient.is_banned || !recipient.is_approved) return false;
  if (sender.posting_restricted_at && recipient.access_level !== 'admin') return false;
  if (isIntakeRestricted(sender)) {
    return recipient.id === sender.intake_staff_user_id && ['mod', 'admin'].includes(recipient.access_level);
  }
  return true;
}

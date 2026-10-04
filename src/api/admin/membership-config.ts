import type { AppContext, User } from '../../types';
import { requireAdmin, verifyCsrf } from '../../middleware';
import { getAllSettings, getRoomById, getUserById, listRooms, logAdminAction, setSetting } from '../../db';
import { applicationRoomEligible, membershipConfigFromSettings, staffContactEligible, welcomeSenderEligible, type MembershipConfig } from '../../lib/membership-config';
import { renderMembershipSettings } from '../../views/admin/membership-settings';
import { renderLayout } from '../../views/layout';
import { html } from '../../lib/http';
import { bad } from './shared';

export async function getMembershipSettings(req: Request, ctx: AppContext, _params: Record<string, string>): Promise<Response> {
  const admin = requireAdmin(ctx);
  const rooms = await listRooms(ctx.env, admin.id);
  const users = (await ctx.env.DB.prepare("SELECT * FROM users WHERE is_approved = 1 AND is_banned = 0 AND display_name IS NOT NULL ORDER BY display_name").all<User>()).results ?? [];
  const body = renderMembershipSettings({ config: membershipConfigFromSettings(await getAllSettings(ctx.env)), rooms: rooms.filter(applicationRoomEligible),
    staff: users.filter(staffContactEligible), senders: users.filter(welcomeSenderEligible), csrfToken: ctx.csrfToken, locale: ctx.locale });
  if (req.headers.get('HX-Request')) return html(body);
  return html(renderLayout({ branding: ctx.branding, origin: ctx.origin, user: admin, rooms, title: 'Membership settings', body, csrfToken: ctx.csrfToken, uploadsEnabled: !!ctx.env.MEDIA }));
}

export async function postMembershipSettings(req: Request, ctx: AppContext, _params: Record<string, string>): Promise<Response> {
  const admin = requireAdmin(ctx);
  await verifyCsrf(req, ctx);
  const form = await req.formData();
  const id = (key: string): number | null => {
    const value = String(form.get(key) ?? '').trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Invalid configured account or room');
    return parsed;
  };
  let config: MembershipConfig;
  try {
    config = { enabled: form.get('enabled') === '1', applicationRoomId: id('applicationRoomId'), staffUserId: id('staffUserId'),
      welcomeEnabled: form.get('welcomeEnabled') === '1', welcomeSenderId: id('welcomeSenderId'), welcomeMessage: String(form.get('welcomeMessage') ?? '').trim(), remindersEnabled: form.get('remindersEnabled') === '1' };
  } catch (error) { return bad(error instanceof Error ? error.message : 'Invalid configuration'); }
  if (config.enabled && (!config.applicationRoomId || !config.staffUserId)) return bad('Select an application forum and staff contact before enabling membership review');
  if (config.applicationRoomId && !applicationRoomEligible(await getRoomById(ctx.env, config.applicationRoomId))) return bad('Application room must be an open forum readable and writable by ordinary members');
  if (config.staffUserId && !staffContactEligible(await getUserById(ctx.env, config.staffUserId))) return bad('Staff contact must be an active approved moderator or administrator accepting private messages');
  if (config.welcomeSenderId && !welcomeSenderEligible(await getUserById(ctx.env, config.welcomeSenderId))) return bad('Welcome sender must be an active approved member');
  if (config.welcomeMessage.length > 4000) return bad('Welcome message must be at most 4000 characters');
  if (config.welcomeEnabled && (!config.welcomeSenderId || !config.welcomeMessage)) return bad('Select a sender and write a message before enabling welcome messages');
  await setSetting(ctx.env, 'membership_config', JSON.stringify(config));
  await logAdminAction(ctx.env, admin.id, 'update_membership_config', 'Membership configuration updated');
  if (req.headers.get('HX-Request')) return new Response(null, { status: 204, headers: { 'HX-Refresh': 'true' } });
  return new Response(null, { status: 303, headers: { Location: '/admin/membership-settings' } });
}

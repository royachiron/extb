import type { AppContext } from '../types';
import {
  listRooms, getRoomBySlug, listRoomPermissions,
  upsertRoomPermission, deleteRoomPermission, updateRoomAccessSettings,
  getUserByDisplayName, logAdminAction, listUsers,
} from '../db';
import { requireMod } from '../middleware';
import { isHiddenRoom } from '../access';
import { renderRoomAccessControl } from '../views/rooms';

/** JSON list of forum rooms for sidebar (excludes is_page=1). */
export async function getRoomsList(
  _req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const all = await listRooms(ctx.env, ctx.user?.id);
  const rooms = all.filter((r) => !r.is_page && !isHiddenRoom(ctx.user ?? null, r));
  return new Response(JSON.stringify({ rooms }), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function getRoomAccess(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  requireMod(ctx);
  const { slug } = params;
  const room = await getRoomBySlug(ctx.env, String(slug || ''));
  if (!room) return new Response('Room not found', { status: 404 });

  const [permissions, users] = await Promise.all([
    listRoomPermissions(ctx.env, room.id),
    listUsers(ctx.env, 1000),
  ]);
  return new Response(renderRoomAccessControl({ room, permissions, users, csrfToken: ctx.csrfToken }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function postRoomAccessToggle(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const { slug } = params;
  const room = await getRoomBySlug(ctx.env, String(slug || ''));
  if (!room) return new Response('Room not found', { status: 404 });

  const form = await req.formData();
  const isExclusive = form.get('is_exclusive') === '1' ? 1 : 0;
  // Disabled selects don't submit - fall back to current room values
  const minRead = (form.get('min_read') as typeof room.min_read) || room.min_read;
  const minPost = (form.get('min_post') as typeof room.min_post) || room.min_post;

  await updateRoomAccessSettings(ctx.env, room.id, minRead, minPost, isExclusive);
  await logAdminAction(ctx.env, user.id, 'update_room_access', `${slug}: exclusive=${isExclusive} read=${minRead} post=${minPost}`);

  const [permissions, users] = await Promise.all([
    listRoomPermissions(ctx.env, room.id),
    listUsers(ctx.env, 1000),
  ]);
  const updatedRoom = { ...room, is_exclusive: isExclusive as 0 | 1, min_read: minRead, min_post: minPost };
  return new Response(renderRoomAccessControl({ room: updatedRoom, permissions, users, csrfToken: ctx.csrfToken }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function postRoomUserAccess(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const { slug } = params;
  const room = await getRoomBySlug(ctx.env, String(slug || ''));
  if (!room) return new Response('Room not found', { status: 404 });

  const form = await req.formData();
  const displayName = String(form.get('display_name') || '').trim();
  const accessLevel = (form.get('access_level') || 'full') as 'blocked' | 'read' | 'full';
  const validLevels = ['blocked', 'read', 'full'] as const;
  const safeLevel = validLevels.includes(accessLevel as any) ? accessLevel : 'full';

  const [targetUser, permissions, users] = await Promise.all([
    getUserByDisplayName(ctx.env, displayName),
    listRoomPermissions(ctx.env, room.id),
    listUsers(ctx.env, 1000),
  ]);

  if (!targetUser) {
    return new Response(renderRoomAccessControl({ room, permissions, users, csrfToken: ctx.csrfToken, error: `User "${displayName}" not found.` }), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  await upsertRoomPermission(ctx.env, room.id, targetUser.id, safeLevel);
  await logAdminAction(ctx.env, mod.id, 'set_room_permission', `${slug}: ${displayName}=${safeLevel}`);

  const updatedPerms = await listRoomPermissions(ctx.env, room.id);
  return new Response(renderRoomAccessControl({ room, permissions: updatedPerms, users, csrfToken: ctx.csrfToken }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function deleteRoomUserAccess(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const { slug, id } = params;
  const room = await getRoomBySlug(ctx.env, String(slug || ''));
  if (!room) return new Response('Room not found', { status: 404 });

  await deleteRoomPermission(ctx.env, Number(id));
  await logAdminAction(ctx.env, mod.id, 'delete_room_permission', `${slug}: perm#${id}`);

  const [permissions, users] = await Promise.all([
    listRoomPermissions(ctx.env, room.id),
    listUsers(ctx.env, 1000),
  ]);
  return new Response(renderRoomAccessControl({ room, permissions, users, csrfToken: ctx.csrfToken }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

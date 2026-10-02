// Room permission management. Self-contained domain extracted from db.ts behind
// the db.ts re-export barrel (zero caller changes).
import type { RoomPermissionRow, Room, Env } from '../types';

export async function listRoomPermissions(env: Env, roomId: number): Promise<RoomPermissionRow[]> {
  const res = await env.DB.prepare(`
    SELECT rp.*, u.display_name
    FROM room_permissions rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ?
    ORDER BY rp.created_at DESC
  `).bind(roomId).all<RoomPermissionRow>();
  return res.results ?? [];
}

export async function upsertRoomPermission(
  env: Env,
  roomId: number,
  userId: number,
  accessType: 'blocked' | 'read' | 'full'
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO room_permissions (room_id, user_id, access_type)
    VALUES (?, ?, ?)
    ON CONFLICT(room_id, user_id) DO UPDATE SET access_type = excluded.access_type
  `).bind(roomId, userId, accessType).run();
}

export async function updateRoomAccessSettings(
  env: Env,
  roomId: number,
  minRead: Room['min_read'],
  minPost: Room['min_post'],
  isExclusive: 0 | 1
): Promise<void> {
  await env.DB.prepare(
    'UPDATE rooms SET min_read = ?, min_post = ?, is_exclusive = ? WHERE id = ?'
  ).bind(minRead, minPost, isExclusive, roomId).run();
}

export async function deleteRoomPermission(env: Env, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM room_permissions WHERE id = ?').bind(id).run();
}

export async function setRoomExclusive(env: Env, roomId: number, isExclusive: 0 | 1): Promise<void> {
  await env.DB.prepare('UPDATE rooms SET is_exclusive = ? WHERE id = ?').bind(isExclusive, roomId).run();
}

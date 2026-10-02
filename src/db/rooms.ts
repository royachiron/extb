import type { Env, Room, RoomKind } from '../types';

export async function upsertLastVisit(env: Env, userId: number, roomId: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_last_visit (user_id, room_id, last_visited_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, room_id) DO UPDATE SET last_visited_at = excluded.last_visited_at`
  ).bind(userId, roomId).run();
}

export async function upsertTopicRead(env: Env, userId: number, topicId: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_topic_read (user_id, topic_id, last_read_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, topic_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).bind(userId, topicId).run();
}

export async function markAllThreadsRead(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET threads_read_before = datetime('now') WHERE id = ?"
  ).bind(userId).run();
}

export async function listRooms(env: Env, userId?: number): Promise<Room[]> {
  const modFilter = userId ? `(t.require_review = 0 OR t.user_id = ? OR (SELECT access_level FROM users WHERE id = ?) IN ('mod', 'admin'))` : 't.require_review = 0';
  const query = userId
    ? `SELECT r.*,
         (SELECT COUNT(*) FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter}) as total_topics,
         (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND p.deleted_at IS NULL AND ${modFilter}) as total_posts,
         (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND ${modFilter}) as total_posts_all,
         (SELECT COUNT(*) FROM topics t
          WHERE t.room_id = r.id
            AND t.status = 'approved'
            AND t.deleted_at IS NULL
            AND ${modFilter}
            AND COALESCE(t.last_reply_at, t.created_at) > max(
                  COALESCE((SELECT last_read_at FROM user_topic_read WHERE user_id = ? AND topic_id = t.id), '0'),
                  COALESCE((SELECT COALESCE(threads_read_before, created_at) FROM users WHERE id = ?), '0'))
         ) AS unread_count,
         (SELECT access_type FROM room_permissions rp WHERE rp.room_id = r.id AND rp.user_id = ?) AS user_permission
       FROM rooms r
       WHERE r.is_archived = 0
       ORDER BY is_page ASC, sort_order ASC, id ASC`
    : `SELECT r.*,
         (SELECT COUNT(*) FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND t.require_review = 0) as total_topics,
         (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND p.deleted_at IS NULL AND t.require_review = 0) as total_posts,
         (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND t.require_review = 0) as total_posts_all,
         0 as unread_count
       FROM rooms r
       WHERE r.is_archived = 0
       ORDER BY is_page ASC, sort_order ASC, id ASC`;

  const res = userId
    ? await env.DB.prepare(query).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId).all<Room>()
    : await env.DB.prepare(query).all<Room>();

  return res.results ?? [];
}
export async function listRoomsForIndex(env: Env, userId?: number): Promise<any[]> {
  const modFilter = userId ? `(t.require_review = 0 OR t.user_id = ? OR (SELECT access_level FROM users WHERE id = ?) IN ('mod', 'admin'))` : 't.require_review = 0';
  const uid = userId ?? 0;
  const modParams = userId ? Array(16).fill(userId) : [];
  const res = await env.DB.prepare(`
    SELECT r.id, r.name, r.slug, r.description, r.icon, r.is_locked, r.sort_order,
      (SELECT COUNT(*) FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter}) as total_topics,
      (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND p.deleted_at IS NULL AND ${modFilter}) as total_replies,
      (SELECT COUNT(*) FROM posts p JOIN topics t ON p.topic_id = t.id WHERE t.room_id = r.id AND p.status = 'approved' AND ${modFilter}) as total_replies_all,
      (SELECT t.title FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter} ORDER BY t.last_reply_at DESC LIMIT 1) as last_topic_title,
      (SELECT t.id FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter} ORDER BY t.last_reply_at DESC LIMIT 1) as last_topic_id, (SELECT t.short_id FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter} ORDER BY t.last_reply_at DESC LIMIT 1) as last_short_id,
      (SELECT u.display_name FROM topics t LEFT JOIN users u ON u.id = t.user_id WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter} ORDER BY t.last_reply_at DESC LIMIT 1) as last_author,
      (SELECT t.last_reply_at FROM topics t WHERE t.room_id = r.id AND t.status = 'approved' AND t.deleted_at IS NULL AND ${modFilter} ORDER BY t.last_reply_at DESC LIMIT 1) as last_activity_at
    FROM rooms r
    WHERE r.is_archived = 0 AND r.is_page = 0
      AND (
        r.is_exclusive = 0
        OR ? IN (SELECT rp.user_id FROM room_permissions rp WHERE rp.room_id = r.id AND rp.access_type IN ('read','full','allow'))
        OR (SELECT access_level FROM users WHERE id = ?) IN ('mod','admin')
      )
    ORDER BY r.sort_order ASC, r.id ASC
  `).bind(...modParams, uid, uid).all<any>();
  return res.results ?? [];
}

export async function getLatestReplies(env: Env, limit = 5, viewerId?: number): Promise<any[]> {
  // Guests: only surface replies from rooms with min_read='anon'.
  const guestFilter = viewerId ? '' : `AND r.min_read = 'anon'`;
  const modFilter = viewerId ? `AND (t.require_review = 0 OR t.user_id = ? OR (SELECT access_level FROM users WHERE id = ?) IN ('mod', 'admin'))` : 'AND t.require_review = 0';
  // Hide rooms flagged is_exclusive unless the viewer is granted or a mod.
  const exclusiveFilter = `AND (
    r.is_exclusive = 0
    OR ? IN (SELECT rp.user_id FROM room_permissions rp WHERE rp.room_id = r.id AND rp.access_type IN ('read','full','allow'))
    OR (SELECT access_level FROM users WHERE id = ?) IN ('mod','admin')
  )`;
  const uid = viewerId ?? 0;
  const modParams = viewerId ? [viewerId, viewerId] : [];

  const res = await env.DB.prepare(`
    SELECT p.id, substr(p.content, 1, 120) as content, p.created_at,
      t.id as topic_id, t.title as topic_title, t.short_id as topic_short_id,
      r.name as room_name, r.slug as room_slug,
      u.display_name as author_name, u.avatar_color, u.avatar_url
    FROM posts p
    JOIN topics t ON p.topic_id = t.id
    JOIN rooms r ON t.room_id = r.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.deleted_at IS NULL AND t.deleted_at IS NULL AND t.removed_at IS NULL AND p.status = 'approved' ${guestFilter} ${modFilter} ${exclusiveFilter}
    ORDER BY p.created_at DESC
    LIMIT ?
  `).bind(...modParams, uid, uid, limit).all<any>();
  return res.results ?? [];
}

export async function getTopContributors(env: Env, limit = 5): Promise<any[]> {
  const res = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.avatar_color, u.avatar_url,
      COUNT(DISTINCT t.id) as topic_count,
      COUNT(DISTINCT p.id) as post_count
    FROM users u
    LEFT JOIN topics t ON t.user_id = u.id AND t.deleted_at IS NULL AND t.status = 'approved'
    LEFT JOIN posts p ON p.user_id = u.id AND p.deleted_at IS NULL AND p.status = 'approved'
    WHERE u.is_banned = 0
    GROUP BY u.id
    ORDER BY (COUNT(DISTINCT t.id) + COUNT(DISTINCT p.id)) DESC
    LIMIT ?
  `).bind(limit).all<any>();
  return res.results ?? [];
}

export async function getRoomBySlug(env: Env, slug: string, userId?: number): Promise<Room | null> {
  const query = userId
    ? `SELECT r.*, (SELECT access_type FROM room_permissions rp WHERE rp.room_id = r.id AND rp.user_id = ?) as user_permission
       FROM rooms r WHERE r.slug = ? AND r.is_archived = 0`
    : `SELECT *, NULL as user_permission FROM rooms WHERE slug = ? AND is_archived = 0`;

  const stmt = env.DB.prepare(query);
  const row = userId ? await stmt.bind(userId, slug).first<Room>() : await stmt.bind(slug).first<Room>();
  return row ?? null;
}

export async function getRoomById(env: Env, id: number, userId?: number): Promise<Room | null> {
  const query = userId
    ? `SELECT r.*, (SELECT access_type FROM room_permissions rp WHERE rp.room_id = r.id AND rp.user_id = ?) as user_permission
       FROM rooms r WHERE r.id = ?`
    : `SELECT *, NULL as user_permission FROM rooms WHERE id = ?`;

  const stmt = env.DB.prepare(query);
  const row = userId ? await stmt.bind(userId, id).first<Room>() : await stmt.bind(id).first<Room>();
  return row ?? null;
}

export async function createRoom(
  env: Env,
  name: string,
  slug: string,
  description: string | null,
  icon: string | null,
  kind: RoomKind,
  minRead: Room['min_read'],
  minPost: Room['min_post'],
  sortOrder: number,
  isLocked: 0 | 1,
  isPage: 0 | 1,
  isExclusive: 0 | 1 = 0
): Promise<Room> {
  const row = await env.DB.prepare(
    `INSERT INTO rooms (name, slug, description, icon, kind, min_read, min_post, sort_order, is_locked, is_page, is_exclusive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(name, slug, description, icon, kind, minRead, minPost, sortOrder, isLocked, isPage, isExclusive)
    .first<Room>();
  if (!row) throw new Error('createRoom failed');
  return row;
}

export async function updateRoom(
  env: Env,
  id: number,
  name: string,
  slug: string,
  description: string | null,
  icon: string | null,
  minRead: Room['min_read'],
  minPost: Room['min_post'],
  sortOrder: number,
  isLocked: 0 | 1
): Promise<void> {
  await env.DB.prepare(
    `UPDATE rooms SET name = ?, slug = ?, description = ?, icon = ?, min_read = ?, min_post = ?,
       sort_order = ?, is_locked = ? WHERE id = ?`
  )
    .bind(name, slug, description, icon, minRead, minPost, sortOrder, isLocked, id)
    .run();
}

export async function deleteRoom(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE rooms SET is_archived = 1 WHERE id = ?').bind(id).run();
}

export async function countTopicsInRoom(env: Env, roomId: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM topics WHERE room_id = ?')
    .bind(roomId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Partial update for admin room edits. Whitelist columns to prevent SQL injection.
const ROOM_UPDATABLE = new Set([
  'name',
  'description',
  'icon',
  'min_read',
  'min_post',
  'is_locked',
  'is_page',
  'sort_order',
  'is_exclusive',
]);

export async function updateRoomPartial(
  env: Env,
  id: number,
  partial: Record<string, unknown>
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(partial)) {
    if (!ROOM_UPDATABLE.has(k)) continue;
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  if (cols.length === 0) return;
  vals.push(id);
  await env.DB.prepare(`UPDATE rooms SET ${cols.join(', ')} WHERE id = ?`).bind(...vals).run();
}

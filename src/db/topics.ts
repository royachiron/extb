import { roomReadVisibility } from './room-visibility';
import type { ContentStatus, Env, ProfileTopicRow, Topic } from '../types';
import { getBlockedIds } from './blocks';

/**
 * Read-visibility WHERE fragment shared by listFeedTopics and
 * listUnansweredTopics. This is security-relevant - it is what stops
 * member-only, exclusive, blocked and under-review content leaking - so it must
 * have exactly one implementation. Callers splice `params` into their bind list
 * at the position the fragment appears in their SQL.
 */
function topicVisibility(viewerId: number | undefined, blockedIds: number[]): { sql: string; params: number[] } {
  const uid = viewerId ?? 0;
  const vis = roomReadVisibility(viewerId);
  const blockFilter = blockedIds.length > 0 ? `AND t.user_id NOT IN (${blockedIds.map(() => '?').join(',')})` : '';
  const sql = `t.status = 'approved' AND t.deleted_at IS NULL AND t.removed_at IS NULL
    AND (t.require_review = 0 OR t.user_id = ?)
    ${blockFilter} AND ${vis.sql}`;
  return { sql, params: [uid, ...blockedIds, ...vis.params] };
}

/** Days a thread stays in the Needs You queue before it ages out. */
export const UNANSWERED_WINDOW_DAYS = 14;
/** Safety cap on the candidate window; canPost filtering happens in TS after this. */
export const UNANSWERED_MAX_CANDIDATES = 200;

/**
 * Topics with no live replies that the viewer could answer, oldest first inside
 * a 14-day window. Backs the Needs You tab.
 *
 * Ordering is deliberate: newest-first buries the threads closest to being
 * abandoned, and oldest-overall surfaces months-dead threads where a reply is a
 * necrobump. Oldest-first-within-window rescues the threads nearest to ageing
 * out while a reply still lands as timely.
 *
 * Note this returns *read*-visible candidates only. Whether the viewer can
 * actually reply depends on canPost(), which folds in membership, rank and
 * per-user room overrides and is not expressible in SQL - the caller must apply
 * it. See getNeedsYou.
 */
export async function listUnansweredTopics(
  env: Env,
  viewerId: number,
  windowDays: number = UNANSWERED_WINDOW_DAYS,
  maxCandidates: number = UNANSWERED_MAX_CANDIDATES
): Promise<Topic[]> {
  const blockedIds = await getBlockedIds(env, viewerId);
  const vis = topicVisibility(viewerId, blockedIds);
  // Deliberately NOT prefiltered on t.reply_count: that column is incremented
  // on reply but never decremented on delete, so a thread whose only replies
  // were removed keeps reply_count > 0 while having no live replies. Those are
  // exactly the threads most in need of an answer.
  const sql = `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url,
         t.require_review,
         (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count
       FROM topics t
       JOIN rooms r ON r.id = t.room_id
       LEFT JOIN users u ON u.id = t.user_id
       WHERE ${vis.sql}
         AND t.is_pinned = 0
         AND (t.user_id IS NULL OR t.user_id != ?)
         AND t.created_at > datetime('now', ?)
         AND (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) = 0
       ORDER BY t.created_at ASC
       LIMIT ?`;
  const res = await env.DB.prepare(sql)
    .bind(...vis.params, viewerId, `-${windowDays} days`, maxCandidates)
    .all<Topic>();
  return res.results ?? [];
}

export async function listFeedTopics(
  env: Env,
  roomId: number | null,
  limit: number,
  offset: number,
  viewerId?: number
): Promise<Topic[]> {
  const blockedIds = viewerId ? await getBlockedIds(env, viewerId) : [];
  const vis = topicVisibility(viewerId, blockedIds);
  const uid = viewerId ?? 0;
  // Unread = newer than both the per-thread read stamp and the user's "mark all read" watermark.
  const unreadSelect = viewerId
    ? `CASE WHEN COALESCE(t.last_reply_at, t.created_at) > max(
           COALESCE((SELECT last_read_at FROM user_topic_read WHERE user_id = ? AND topic_id = t.id), '0'),
           COALESCE((SELECT COALESCE(threads_read_before, created_at) FROM users WHERE id = ?), '0')
         ) THEN 1 ELSE 0 END`
    : '0';
  const unreadParams = viewerId ? [uid, uid] : [];

  const sql = roomId === null
    ? `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review,
         (SELECT 1 FROM polls WHERE topic_id = t.id) as has_poll,
         (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
         (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json,
         (${unreadSelect}) AS is_unread
         FROM topics t
         JOIN rooms r ON r.id = t.room_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE ${vis.sql}
         ORDER BY t.is_pinned DESC, t.last_reply_at DESC
         LIMIT ? OFFSET ?`
    : `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review,
         (SELECT 1 FROM polls WHERE topic_id = t.id) as has_poll,
         (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
         (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json,
         (${unreadSelect}) AS is_unread
         FROM topics t
         JOIN rooms r ON r.id = t.room_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.room_id = ? AND ${vis.sql}
         ORDER BY t.is_pinned DESC, t.last_reply_at DESC
         LIMIT ? OFFSET ?`;
  const stmt = roomId === null
    ? env.DB.prepare(sql).bind(...unreadParams, ...vis.params, limit, offset)
    : env.DB.prepare(sql).bind(...unreadParams, roomId, ...vis.params, limit, offset);
  const res = await stmt.all<Topic>();
  return res.results ?? [];
}

export async function getTopicById(env: Env, id: number): Promise<Topic | null> {
  const row = await env.DB.prepare(
    `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review, u.signature,
       (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
       (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
        FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json
     FROM topics t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.id = ?`
  ).bind(id).first<Topic>();
  return row ?? null;
}

export async function getTopicByShortId(env: Env, shortId: string): Promise<Topic | null> {
  const row = await env.DB.prepare(
    `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review, u.signature,
       (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
       (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
        FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json
     FROM topics t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.short_id = ?`
  ).bind(shortId).first<Topic>();
  return row ?? null;
}

export async function getTopicTitleByShortId(env: Env, shortId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT title FROM topics WHERE short_id = ?').bind(shortId).first<{ title: string }>();
  return row?.title ?? null;
}

export async function createTopic(
  env: Env,
  roomId: number,
  userId: number | null,
  anonName: string | null,
  title: string,
  content: string,
  tags: string | null,
  status: ContentStatus, deleteOnApprove: 0 | 1 = 0
): Promise<Topic> {
  const chars = '0123456789ABC';
  let shortId = '';
  for (let i = 0; i < 6; i++) shortId += chars[Math.floor(Math.random() * chars.length)];

  const row = await env.DB.prepare(
    `INSERT INTO topics (room_id, user_id, anon_name, title, content, tags, status, reply_count, short_id, delete_on_approve)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING *`
  )
    .bind(roomId, userId, anonName, title, content, tags, status, shortId, deleteOnApprove)
    .first<Topic>();
  if (!row) throw new Error('createTopic failed');
  return row;
}

export async function updateTopic(
  env: Env,
  id: number,
  title: string,
  content: string,
  tags: string | null
): Promise<void> {
  await env.DB.prepare(
    "UPDATE topics SET title = ?, content = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(title, content, tags, id)
    .run();
}

export async function softDeleteTopic(
  env: Env,
  id: number,
  reason: string,
  deletedBy: number
): Promise<void> {
  await env.DB.prepare(
    `UPDATE topics SET deleted_at = datetime('now'), delete_reason = ?, deleted_by = ?
     WHERE id = ?`
  )
    .bind(reason, deletedBy, id)
    .run();
}

export async function pinTopic(env: Env, id: number, pinned: 0 | 1): Promise<void> {
  await env.DB.prepare('UPDATE topics SET is_pinned = ? WHERE id = ?').bind(pinned, id).run();
}

export async function lockTopic(env: Env, id: number, locked: 0 | 1): Promise<void> {
  await env.DB.prepare('UPDATE topics SET is_locked = ? WHERE id = ?').bind(locked, id).run();
}

export async function togglePinTopic(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE topics SET is_pinned = CASE is_pinned WHEN 1 THEN 0 ELSE 1 END WHERE id = ?'
  )
    .bind(id)
    .run();
}

export async function toggleLockTopic(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE topics SET is_locked = CASE is_locked WHEN 1 THEN 0 ELSE 1 END WHERE id = ?'
  )
    .bind(id)
    .run();
}

export async function listFeedTopicsForMod(
  env: Env,
  roomId: number | null,
  limit: number,
  offset: number,
  viewerId?: number
): Promise<Topic[]> {
  const blockedIds = viewerId ? await getBlockedIds(env, viewerId) : [];
  const blockFilter = blockedIds.length > 0 ? `AND t.user_id NOT IN (${blockedIds.map(() => '?').join(',')})` : '';

  const sql = roomId === null
    ? `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review,
         (SELECT 1 FROM polls WHERE topic_id = t.id) as has_poll,
         (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
         (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json,
         0 AS is_unread
         FROM topics t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.deleted_at IS NULL ${blockFilter}
         ORDER BY t.is_pinned DESC, t.last_reply_at DESC LIMIT ? OFFSET ?`
    : `SELECT t.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.require_review as user_require_review, t.require_review,
         (SELECT 1 FROM polls WHERE topic_id = t.id) as has_poll,
         (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'approved' AND p.deleted_at IS NULL) as active_reply_count,
         (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id) AS badges_json,
         0 AS is_unread
         FROM topics t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.room_id = ? AND t.deleted_at IS NULL ${blockFilter}
         ORDER BY t.is_pinned DESC, t.last_reply_at DESC LIMIT ? OFFSET ?`;

  const stmt = roomId === null
    ? env.DB.prepare(sql).bind(...blockedIds, limit, offset)
    : env.DB.prepare(sql).bind(roomId, ...blockedIds, limit, offset);
  const res = await stmt.all<Topic>();
  return res.results ?? [];
}
export async function setTopicStatus(
  env: Env,
  id: number,
  status: ContentStatus, deleteOnApprove: 0 | 1 = 0
): Promise<void> {
  await env.DB.prepare('UPDATE topics SET status = ? WHERE id = ?')
    .bind(status, id)
    .run();
}

export async function moveTopic(
  env: Env,
  topicId: number,
  newRoomId: number
): Promise<void> {
  await env.DB.prepare('UPDATE topics SET room_id = ? WHERE id = ?')
    .bind(newRoomId, topicId)
    .run();
}

export async function countPendingForUser(env: Env, userId: number): Promise<number> {
  const topics = await env.DB.prepare("SELECT COUNT(*) as n FROM topics WHERE user_id = ? AND status = 'pending' AND deleted_at IS NULL").bind(userId).first<{n: number}>();
  const posts = await env.DB.prepare("SELECT COUNT(*) as n FROM posts WHERE user_id = ? AND status = 'pending' AND deleted_at IS NULL").bind(userId).first<{n: number}>();
  return (topics?.n ?? 0) + (posts?.n ?? 0);
}

export async function setTopicReviewStatus(env: Env, topicId: number, requireReview: number): Promise<void> {
  await env.DB.prepare('UPDATE topics SET require_review = ? WHERE id = ?').bind(requireReview, topicId).run();
}

export async function listPendingQuestions(env: Env): Promise<Topic[]> {
  const res = await env.DB.prepare(
    `SELECT t.*, u.display_name AS author_display_name, r.name as room_name FROM topics t
       JOIN rooms r ON r.id = t.room_id
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.status = 'pending' AND t.deleted_at IS NULL
       ORDER BY t.created_at ASC`
  ).all<Topic>();
  return res.results ?? [];
}

/** Intro topics the applicant asked to auto-delete once approved. */
export async function listDeleteOnApproveIntros(env: Env, userId: number): Promise<{ id: number }[]> {
  const intros = await env.DB.prepare(
    "SELECT id FROM topics WHERE user_id = ? AND room_id = (SELECT id FROM rooms WHERE slug = 'introductions') AND delete_on_approve = 1 AND removed_at IS NULL"
  ).bind(userId).all<{ id: number }>();
  return intros.results ?? [];
}

export async function moveTopicToRoom(env: Env, topicId: number, roomId: number): Promise<void> {
  await env.DB.prepare('UPDATE topics SET room_id = ? WHERE id = ?')
    .bind(roomId, topicId).run();
}

/** Owner wipe: blank the OP without deleting the row (replies may survive). */
export async function wipeTopicContent(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE topics SET content = '[deleted]', title = '[deleted]', user_id = NULL, anon_name = NULL WHERE id = ?`
  ).bind(id).run();
}

/** After an owner wipe: soft-delete the topic only when no posts remain. */
export async function softDeleteTopicIfEmpty(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE topics SET deleted_at = datetime('now') WHERE id = ? AND (SELECT COUNT(*) FROM posts WHERE topic_id = ?) = 0`
  ).bind(id, id).run();
}

export async function restoreTopic(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE topics SET deleted_at = NULL, delete_reason = NULL, deleted_by = NULL, removed_at = NULL, removed_by = NULL WHERE id = ?'
  ).bind(id).run();
}

export async function removeTopic(env: Env, topicId: number, modId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE topics SET removed_at = datetime('now'), removed_by = ? WHERE id = ?`
  )
    .bind(modId, topicId)
    .run();
}

export async function getRecentTopicsByUser(
  env: Env,
  userId: number,
  limit: number,
  viewerId?: number
): Promise<ProfileTopicRow[]> {
  const modFilter = viewerId ? `AND (t.require_review = 0 OR t.user_id = ? OR (SELECT access_level FROM users WHERE id = ?) IN ('mod', 'admin'))` : 'AND t.require_review = 0';
  const vis = roomReadVisibility(viewerId);
  const modParams = viewerId ? [viewerId, viewerId] : [];
  const res = await env.DB.prepare(
    `SELECT t.id, t.short_id, t.title, t.created_at, t.room_id, r.name AS room_name, r.slug AS room_slug
       FROM topics t JOIN rooms r ON r.id = t.room_id
       WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.status = 'approved' ${modFilter} AND ${vis.sql}
       ORDER BY t.created_at DESC LIMIT ?`
  )
    .bind(userId, ...modParams, ...vis.params, limit)
    .all<ProfileTopicRow>();
  return res.results ?? [];
}

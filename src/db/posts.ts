import { roomReadVisibility } from './room-visibility';
import type { ContentStatus, Env, Post, ProfilePostRow } from '../types';
import { orderPostsDfs } from './post-pages';

export const MAX_REPLY_DEPTH = 3;

// Resolve the effective (parent_id, depth) for a new reply, clamping at MAX_REPLY_DEPTH.
// If the requested parent is already at MAX_REPLY_DEPTH, the new post inherits that parent
// (no level 4); otherwise depth = parent.depth + 1.
async function resolveParentDepth(
  env: Env,
  topicId: number,
  requestedParentId: number | null,
): Promise<{ parentId: number | null; depth: number }> {
  if (requestedParentId == null) return { parentId: null, depth: 0 };
  const parent = await env.DB.prepare(
    `SELECT id, depth, topic_id FROM posts WHERE id = ? AND deleted_at IS NULL AND removed_at IS NULL`
  ).bind(requestedParentId).first<{ id: number; depth: number; topic_id: number }>();
  if (!parent || parent.topic_id !== topicId) {
    return { parentId: null, depth: 0 };
  }
  if (parent.depth >= MAX_REPLY_DEPTH) {
    return { parentId: parent.id, depth: MAX_REPLY_DEPTH };
  }
  return { parentId: parent.id, depth: parent.depth + 1 };
}

export async function getPostById(env: Env, id: number): Promise<Post | null> {
  const row = await env.DB.prepare(
    `SELECT p.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.pronouns, u.access_level, u.signature,
       (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
        FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = p.user_id) AS badges_json
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`
  ).bind(id).first<Post>();
  return row ?? null;
}

export async function listPostsForTopic(env: Env, topicId: number): Promise<Post[]> {
  const res = await env.DB.prepare(
    `SELECT p.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.pronouns, u.access_level, u.signature,
       (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
        FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = p.user_id) AS badges_json
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     WHERE topic_id = ? AND status = 'approved' AND deleted_at IS NULL AND removed_at IS NULL
     ORDER BY created_at ASC, id ASC`
  )
    .bind(topicId)
    .all<Post>();
  return orderPostsDfs(res.results ?? []);
}

export async function listPostsForTopicAll(env: Env, topicId: number): Promise<Post[]> {
  const res = await env.DB.prepare(
    `SELECT p.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.pronouns, u.access_level, u.signature,
       (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
        FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = p.user_id) AS badges_json
     FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE topic_id = ? AND removed_at IS NULL ORDER BY created_at ASC, id ASC`
  )
    .bind(topicId)
    .all<Post>();
  return orderPostsDfs(res.results ?? []);
}

export async function createPost(
  env: Env,
  topicId: number,
  userId: number | null,
  anonName: string | null,
  content: string,
  status: ContentStatus,
  parentPostId: number | null = null,
): Promise<Post> {
  const { parentId, depth } = await resolveParentDepth(env, topicId, parentPostId);
  const row = await env.DB.prepare(
    `INSERT INTO posts (topic_id, user_id, anon_name, content, status, parent_post_id, depth)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(topicId, userId, anonName, content, status, parentId, depth)
    .first<Post>();
  if (!row) throw new Error('createPost failed');
  if (status === 'approved') {
    await env.DB.prepare(
      "UPDATE topics SET reply_count = reply_count + 1, last_reply_at = datetime('now') WHERE id = ?"
    )
      .bind(topicId)
      .run();
  }
  return row;
}

export async function updatePost(
  env: Env,
  id: number,
  content: string
): Promise<void> {
  await env.DB.prepare(
    "UPDATE posts SET content = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(content, id)
    .run();
}

export async function softDeletePost(
  env: Env,
  id: number,
  reason: string,
  deletedBy: number
): Promise<void> {
  await env.DB.prepare(
    `UPDATE posts SET deleted_at = datetime('now'), delete_reason = ?, deleted_by = ?
     WHERE id = ?`
  )
    .bind(reason, deletedBy, id)
    .run();
}

export async function removePost(env: Env, postId: number, modId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE posts SET removed_at = datetime('now'), removed_by = ? WHERE id = ?`
  )
    .bind(modId, postId)
    .run();
}

/** Owner/mod hard delete - row is erased permanently. */
export async function hardDeletePost(env: Env, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
}

export async function restorePost(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE posts SET deleted_at = NULL, delete_reason = NULL, deleted_by = NULL, removed_at = NULL, removed_by = NULL WHERE id = ?'
  ).bind(id).run();
}

export async function archivePost(env: Env, id: number, modId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE posts SET archived_at = datetime('now'), archived_by = ? WHERE id = ?`
  ).bind(modId, id).run();
}

export async function unarchivePost(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE posts SET archived_at = NULL, archived_by = NULL WHERE id = ?'
  ).bind(id).run();
}

/** Owner topic-wipe, keep_replies=1: detach authorship of own replies, keep content. */
export async function detachOwnReplies(env: Env, topicId: number, userId: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE posts SET user_id = NULL, anon_name = NULL WHERE topic_id = ? AND user_id = ?'
  ).bind(topicId, userId).run();
}

/** Owner topic-wipe, keep_replies omitted: wipe content of own replies too. */
export async function wipeOwnReplies(env: Env, topicId: number, userId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE posts SET content = '[deleted]', user_id = NULL, anon_name = NULL WHERE topic_id = ? AND user_id = ?`
  ).bind(topicId, userId).run();
}

export async function setPostStatus(
  env: Env,
  id: number,
  status: ContentStatus, deleteOnApprove: 0 | 1 = 0
): Promise<void> {
  await env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function listPendingQuestionPosts(env: Env): Promise<Post[]> {
  const res = await env.DB.prepare(
    `SELECT p.*, u.display_name AS author_display_name, t.title as topic_title, t.short_id as topic_short_id FROM posts p
       JOIN topics t ON t.id = p.topic_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.status = 'pending' AND p.deleted_at IS NULL
       ORDER BY p.created_at ASC`
  ).all<Post>();
  return res.results ?? [];
}

export async function getRecentPostsByUser(
  env: Env,
  userId: number,
  limit: number,
  viewerId?: number
): Promise<ProfilePostRow[]> {
  const modFilter = viewerId ? `AND (t.require_review = 0 OR t.user_id = ? OR (SELECT access_level FROM users WHERE id = ?) IN ('mod', 'admin'))` : 'AND t.require_review = 0';
  const vis = roomReadVisibility(viewerId);
  const modParams = viewerId ? [viewerId, viewerId] : [];
  const res = await env.DB.prepare(
    `SELECT p.id, p.topic_id, t.short_id as topic_short_id, p.content, p.created_at,
            t.title AS topic_title, r.name AS room_name, r.slug AS room_slug
       FROM posts p
       JOIN topics t ON t.id = p.topic_id
       JOIN rooms r ON r.id = t.room_id
       WHERE p.user_id = ? AND p.deleted_at IS NULL AND p.status = 'approved'
         AND t.deleted_at IS NULL ${modFilter} AND ${vis.sql}
       ORDER BY p.created_at DESC LIMIT ?`
  )
    .bind(userId, ...modParams, ...vis.params, limit)
    .all<ProfilePostRow>();
  return res.results ?? [];
}

import type { Env, Post, Topic } from '../types';

export interface DeletedPost extends Post {
  author_name: string | null;
  deleted_by_name: string | null;
}

export interface DeletedTopic extends Topic {
  author_name: string | null;
  deleted_by_name: string | null;
}

export async function listDeletedPosts(
  env: Env,
  limit = 50,
  offset = 0
): Promise<DeletedPost[]> {
  const result = await env.DB.prepare(
    `SELECT p.id, p.content, p.created_at, p.deleted_at, p.delete_reason, p.deleted_by,
            p.removed_at, p.removed_by, p.user_id, p.topic_id,
            u.display_name AS author_name,
            m.display_name AS deleted_by_name
     FROM posts p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users m ON m.id = COALESCE(p.removed_by, p.deleted_by)
     WHERE (p.deleted_at IS NOT NULL OR p.removed_at IS NOT NULL) AND p.archived_at IS NULL
     ORDER BY COALESCE(p.removed_at, p.deleted_at) DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<DeletedPost>();
  return result.results;
}

export async function listDeletedTopics(
  env: Env,
  limit = 50,
  offset = 0
): Promise<DeletedTopic[]> {
  const result = await env.DB.prepare(
    `SELECT t.id, t.title, t.created_at, t.deleted_at, t.delete_reason, t.deleted_by,
            t.removed_at, t.removed_by, t.user_id,
            u.display_name AS author_name,
            m.display_name AS deleted_by_name
     FROM topics t
     LEFT JOIN users u ON u.id = t.user_id
     LEFT JOIN users m ON m.id = COALESCE(t.removed_by, t.deleted_by)
     WHERE t.deleted_at IS NOT NULL OR t.removed_at IS NOT NULL
     ORDER BY COALESCE(t.removed_at, t.deleted_at) DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<DeletedTopic>();
  return result.results;
}

export interface ArchivedPost extends Post {
  author_name: string | null;
  archived_by_name: string | null;
}

export async function listArchivedPosts(
  env: Env,
  limit = 50,
  offset = 0
): Promise<ArchivedPost[]> {
  const result = await env.DB.prepare(
    `SELECT p.id, p.content, p.created_at, p.archived_at, p.archived_by,
            p.user_id, p.topic_id,
            u.display_name AS author_name,
            m.display_name AS archived_by_name
     FROM posts p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users m ON m.id = p.archived_by
     WHERE p.archived_at IS NOT NULL
     ORDER BY p.archived_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<ArchivedPost>();
  return result.results;
}

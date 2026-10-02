import type { Env, Post } from '../types';

// NOTE: no imports from '../db' - the barrel imports FROM this module
// (orderPostsDfs); importing back would create an init cycle.

const POST_COLS = `p.*, u.display_name AS author_display_name, u.avatar_color, u.avatar_url, u.pronouns, u.access_level, u.signature,
  (SELECT json_group_array(json_object('id', b.id, 'name', b.name, 'icon', b.icon, 'color', b.color, 'text_color', b.text_color, 'shape', b.shape, 'status', ub.status))
   FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = p.user_id) AS badges_json`;

// Order posts in depth-first pre-order so the view can render the flat list with indent classes.
// Top-level replies (parent_post_id IS NULL) are sorted by (created_at, id); each parent's
// children are inserted right after the parent, recursively.
export function orderPostsDfs(posts: Post[]): Post[] {
  const byParent = new Map<number | null, Post[]>();
  for (const p of posts) {
    const key = p.parent_post_id ?? null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(p);
    else byParent.set(key, [p]);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
      return a.id - b.id;
    });
  }
  const out: Post[] = [];
  const visit = (parentId: number | null) => {
    const kids = byParent.get(parentId);
    if (!kids) return;
    for (const k of kids) {
      out.push(k);
      visit(k.id);
    }
  };
  visit(null);
  // Append any orphans (parent_post_id pointing to a removed/deleted post) at the end.
  if (out.length !== posts.length) {
    const seen = new Set(out.map((p) => p.id));
    for (const p of posts) if (!seen.has(p.id)) out.push(p);
  }
  return out;
}

export interface PostCursor {
  createdAt: string;
  id: number;
}

// Cursor format "createdAt|id". created_at is "YYYY-MM-DD HH:MM:SS" (no pipes),
// so a single pipe separator round-trips safely. URL-encode at the call site.
export function encodeCursor(c: PostCursor): string {
  return `${c.createdAt}|${c.id}`;
}

export function decodeCursor(raw: string | null): PostCursor | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf('|');
  if (sep <= 0) return null;
  const createdAt = raw.slice(0, sep);
  const id = parseInt(raw.slice(sep + 1), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(createdAt)) return null;
  return { createdAt, id };
}

export interface PostPage {
  posts: Post[];
  nextCursor: string | null;
}

/**
 * One page of a topic's thread: `limit` top-level posts (seek-paged on
 * (created_at, id) via idx_posts_topic_roots) plus ALL their descendants, so
 * every page contains complete subtrees and the view's ancestor-chain builder
 * stays correct per batch. Descendants resolved with a recursive CTE because
 * depth is display-clamped at MAX_REPLY_DEPTH while parent chains can be
 * arbitrarily long.
 *
 * modView=true mirrors listPostsForTopicAll (only removed_at filtered);
 * modView=false mirrors listPostsForTopic (approved + not deleted).
 */
export async function listPostsForTopicPage(
  env: Env,
  topicId: number,
  limit: number,
  after: PostCursor | null,
  modView: boolean,
): Promise<PostPage> {
  const visFilter = modView
    ? `p.removed_at IS NULL`
    : `p.status = 'approved' AND p.deleted_at IS NULL AND p.removed_at IS NULL`;

  const seek = after ? `AND (p.created_at, p.id) > (?, ?)` : '';
  const rootBinds: unknown[] = after
    ? [topicId, after.createdAt, after.id, limit + 1]
    : [topicId, limit + 1];

  const rootsRes = await env.DB.prepare(
    `SELECT ${POST_COLS}
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.topic_id = ? AND p.parent_post_id IS NULL AND ${visFilter} ${seek}
     ORDER BY p.created_at ASC, p.id ASC
     LIMIT ?`
  ).bind(...rootBinds).all<Post>();

  const rootRows = rootsRes.results ?? [];
  const hasMore = rootRows.length > limit;
  const roots = hasMore ? rootRows.slice(0, limit) : rootRows;
  if (roots.length === 0) return { posts: [], nextCursor: null };

  const lastRoot = roots[roots.length - 1]!;
  const nextCursor = hasMore
    ? encodeCursor({ createdAt: lastRoot.created_at, id: lastRoot.id })
    : null;

  const rootIds = roots.map((r) => r.id);
  const ph = rootIds.map(() => '?').join(',');
  const descRes = await env.DB.prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM posts WHERE id IN (${ph})
       UNION
       SELECT c.id FROM posts c JOIN sub s ON c.parent_post_id = s.id
     )
     SELECT ${POST_COLS}
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id IN (SELECT id FROM sub) AND p.id NOT IN (${ph}) AND ${visFilter}`
  ).bind(...rootIds, ...rootIds).all<Post>();

  return {
    posts: orderPostsDfs([...roots, ...(descRes.results ?? [])]),
    nextCursor,
  };
}

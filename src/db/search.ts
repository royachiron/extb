import { roomReadVisibility } from './room-visibility';
// FTS5 search over posts + topics with the viewer's read-access mirrored into
// SQL. Interpolated clauses use only server-derived literals (numeric user id,
// fixed level lists) - the query text itself stays parameterized.
import type { Env, User } from '../types';

export interface SearchResultRow {
  type: 'post' | 'topic';
  item_id: number;
  content: string;
  topic_title: string;
  topic_short_id: string;
  rank: number;
}

export async function searchContent(
  env: Env,
  user: User | null,
  ftsQuery: string,
  limit: number,
  offset: number,
): Promise<SearchResultRow[]> {
  const isMod = !!user && !!user.is_approved && !user.is_banned && ['mod', 'admin'].includes(user.access_level);
  const vis = roomReadVisibility(user?.id);
  const accessClause = `AND ${vis.sql}`;
  const reviewClause = isMod ? '' : `AND (t.require_review = 0 OR t.user_id = ${user?.id ?? 0})`;

  return env.DB.prepare(
    `SELECT 'post' as type, p.id as item_id, p.content, t.title as topic_title, t.short_id as topic_short_id, f.rank
     FROM posts p
     JOIN posts_fts f ON p.id = f.rowid
     JOIN topics t ON t.id = p.topic_id
     JOIN rooms r ON r.id = t.room_id
     WHERE posts_fts MATCH ? AND p.status = 'approved' AND p.deleted_at IS NULL ${accessClause} ${reviewClause}
     UNION ALL
     SELECT 'topic' as type, t.id as item_id, t.content, t.title as topic_title, t.short_id as topic_short_id, f.rank
     FROM topics t
     JOIN topics_fts f ON t.id = f.rowid
     JOIN rooms r ON r.id = t.room_id
     WHERE topics_fts MATCH ? AND t.status = 'approved' AND t.deleted_at IS NULL ${accessClause} ${reviewClause}
     ORDER BY rank LIMIT ? OFFSET ?`
  ).bind(ftsQuery, ...vis.params, ftsQuery, ...vis.params, limit, offset).all<SearchResultRow>().then(r => r.results ?? []);
}

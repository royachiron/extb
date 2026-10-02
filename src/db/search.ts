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
  // Hardening: Filter out locked rooms from search unless user is mod
  const isMod = user && ['mod', 'admin'].includes(user.access_level);
  // Mirror canRead()'s min_read rank gate so search never leaks titles or
  // excerpts from rooms the viewer cannot open. Verified email required
  // for any rank above anon, matching rank() in src/access.ts.
  const verified = !!user && !!user.is_approved && !user.is_banned;
  const readableLevels = !verified
    ? `('anon')`
    : user!.access_level === 'member'
      ? `('anon','member')`
      : `('anon','member','full')`;
  const accessClause = isMod
    ? ''
    : `AND r.is_locked = 0 AND r.min_read IN ${readableLevels} AND (r.is_exclusive = 0 OR ${user?.id ?? 0} IN (SELECT rp.user_id FROM room_permissions rp WHERE rp.room_id = r.id AND rp.access_type IN ('read','full','allow')))`;
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
  ).bind(ftsQuery, ftsQuery, limit, offset).all<SearchResultRow>().then(r => r.results ?? []);
}

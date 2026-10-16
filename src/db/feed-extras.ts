// Feed-card extras: last replier, participants, 24h activity, unread count,
// reaction total. Loaded for ONE feed page (<= 31 topics) in two batched
// round trips, then aggregated in TS.
//
// Kept out of listFeedTopics on purpose: that query has other callers that ask
// for 100-500 rows, and correlated subqueries there would multiply across them.
// Raw post rows are fetched once and every stat is derived from them; reply
// reactions are counted by those ids.
//
// IN-lists use placeholders, or json_each(?) past 90 ids, so a busy page can
// never exceed D1's 100-bound-parameter limit (see inList).
import type { Env, FeedCardExtras, Topic } from '../types';

export interface ExtrasPostRow { id: number; topic_id: number; user_id: number | null; anon_name: string | null; created_at: string }
export interface ExtrasUserRow { id: number; display_name: string | null; avatar_url: string | null; avatar_color: string | null }

/** SQLite datetime('now') format, so read marks and created_at compare as strings. */
export function sqlNow(now: Date): string {
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

/** Pure aggregation - every stat comes from the raw post rows. Exported for tests. */
export function buildFeedCardExtras(input: {
  topics: Pick<Topic, 'id' | 'user_id' | 'is_unread'>[];
  posts: ExtrasPostRow[];
  users: Map<number, ExtrasUserRow>;
  opReactions: Map<number, number>;
  replyReactions: Map<number, number>;
  readMarks: Map<number, string>;
  watermark: string | null;
  viewerId: number | null;
  blockedIds: number[];
  now: Date;
}): Map<number, FeedCardExtras> {
  const { topics, users, opReactions, replyReactions, readMarks, watermark, viewerId, now } = input;
  const blocked = new Set(input.blockedIds);
  const dayAgo = sqlNow(new Date(now.getTime() - 24 * 3600 * 1000));
  const byTopic = new Map<number, ExtrasPostRow[]>();
  for (const p of input.posts) {
    const list = byTopic.get(p.topic_id);
    if (list) list.push(p); else byTopic.set(p.topic_id, [p]);
  }

  const out = new Map<number, FeedCardExtras>();
  for (const t of topics) {
    const posts = (byTopic.get(t.id) ?? []).slice().sort((a, b) => b.id - a.id); // newest first
    const nameOf = (p: ExtrasPostRow) =>
      p.user_id == null ? (p.anon_name || 'anon') : (users.get(p.user_id)?.display_name || `user${p.user_id}`);

    // Last replier / participants skip people the viewer blocked.
    const visible = posts.filter((p) => p.user_id == null || !blocked.has(p.user_id));
    const last = visible[0];

    const people: FeedCardExtras['people'] = [];
    const seen = new Set<number>();
    for (const p of visible) {
      if (people.length >= 3) break;
      if (p.user_id == null || p.user_id === t.user_id || seen.has(p.user_id)) continue;
      seen.add(p.user_id);
      const u = users.get(p.user_id);
      people.push({ name: u?.display_name || `user${p.user_id}`, avatar_url: u?.avatar_url ?? null, avatar_color: u?.avatar_color ?? null });
    }

    let newReplies = 0;
    if (t.is_unread && viewerId) {
      const mark = [readMarks.get(t.id) ?? '0', watermark ?? '0'].sort().pop()!;
      newReplies = posts.filter((p) => p.created_at > mark && p.user_id !== viewerId).length;
    }

    out.set(t.id, {
      replies: posts.length,
      replies24h: posts.filter((p) => p.created_at > dayAgo).length,
      newReplies,
      reactions: (opReactions.get(t.id) ?? 0) + posts.reduce((n, p) => n + (replyReactions.get(p.id) ?? 0), 0),
      lastReply: last ? { name: nameOf(last), at: last.created_at } : null,
      people,
    });
  }
  return out;
}

export async function listFeedCardExtras(
  env: Env,
  topics: Topic[],
  viewerId: number | null,
): Promise<Map<number, FeedCardExtras>> {
  if (topics.length === 0) return new Map();
  // Fail-soft: if the batch query fails (e.g. partial mock in tests), cards still render.
  try {
    const ids = inList(topics.map((t) => t.id));
    const viewer = viewerId ?? 0;

    const [postsRes, opRxRes, marksRes, wmRes, blocksRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, topic_id, user_id, anon_name, created_at FROM posts
          WHERE topic_id IN ${ids.sql} AND status = 'approved' AND deleted_at IS NULL`
      ).bind(...ids.params),
      env.DB.prepare(
        `SELECT topic_id AS id, COUNT(*) AS n FROM post_reactions WHERE topic_id IN ${ids.sql} GROUP BY topic_id`
      ).bind(...ids.params),
      env.DB.prepare(
        `SELECT topic_id, last_read_at FROM user_topic_read WHERE user_id = ? AND topic_id IN ${ids.sql}`
      ).bind(viewer, ...ids.params),
      env.DB.prepare(
        `SELECT COALESCE(threads_read_before, created_at) AS w FROM users WHERE id = ?`
      ).bind(viewer),
      env.DB.prepare('SELECT blocked_id FROM user_blocks WHERE blocker_id = ?').bind(viewer),
    ]);
    const posts = (postsRes?.results ?? []) as ExtrasPostRow[];

    const userIds = inList([...new Set(posts.flatMap((p) => (p.user_id == null ? [] : [p.user_id])))]);
    const postIds = inList(posts.map((p) => p.id));
    const [usersRes, replyRxRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, display_name, avatar_url, avatar_color FROM users WHERE id IN ${userIds.sql}`
      ).bind(...userIds.params),
      env.DB.prepare(
        `SELECT post_id AS id, COUNT(*) AS n FROM post_reactions WHERE post_id IN ${postIds.sql} GROUP BY post_id`
      ).bind(...postIds.params),
    ]);

    const countMap = (rows: unknown[] | undefined) =>
      new Map(((rows ?? []) as { id: number; n: number }[]).map((r) => [r.id, r.n]));
    return buildFeedCardExtras({
      topics,
      posts,
      users: new Map(((usersRes?.results ?? []) as ExtrasUserRow[]).map((u) => [u.id, u])),
      opReactions: countMap(opRxRes?.results),
      replyReactions: countMap(replyRxRes?.results),
      readMarks: new Map(((marksRes?.results ?? []) as { topic_id: number; last_read_at: string }[]).map((r) => [r.topic_id, r.last_read_at])),
      watermark: ((wmRes?.results ?? [])[0] as { w: string | null } | undefined)?.w ?? null,
      viewerId,
      blockedIds: ((blocksRes?.results ?? []) as { blocked_id: number }[]).map((r) => r.blocked_id),
      now: new Date(),
    });
  } catch {
    return new Map();
  }
}

/**
 * IN-list for a batch statement. Plain placeholders while they fit (cheapest:
 * json_each costs one extra row read per element), json_each beyond that so a
 * busy page never trips D1's 100-parameter cap.
 */
export function inList(ids: number[]): { sql: string; params: (number | string)[] } {
  if (ids.length === 0) return { sql: '(NULL)', params: [] };
  if (ids.length <= 90) return { sql: `(${ids.map(() => '?').join(',')})`, params: ids };
  return { sql: '(SELECT value FROM json_each(?))', params: [JSON.stringify(ids)] };
}

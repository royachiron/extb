// Content-warning tag persistence: cw_tags, topic_cw_tags, post_cw_tags.
// Self-contained domain extracted from db.ts behind the db.ts re-export barrel
// (zero caller changes).
import type { Env, CwTag, CwTagSeed } from '../types';

export async function listCwTags(env: Env, includeArchived = false): Promise<CwTag[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  const res = await env.DB.prepare(`SELECT * FROM cw_tags ${where} ORDER BY sort_order ASC, id ASC`).all<CwTag>();
  return res.results ?? [];
}

export async function getCwTag(env: Env, id: number): Promise<CwTag | null> {
  return (await env.DB.prepare('SELECT * FROM cw_tags WHERE id = ?').bind(id).first<CwTag>()) ?? null;
}

export async function createCwTag(env: Env, t: CwTagSeed): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO cw_tags (slug, name, description, color, is_spoiler, is_nsfw, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(t.slug, t.name, t.description, t.color, t.is_spoiler, t.is_nsfw, t.sort_order).run();
  return Number(res.meta.last_row_id);
}

const CW_TAG_UPDATABLE = new Set(['name', 'description', 'color', 'is_spoiler', 'is_nsfw', 'sort_order', 'is_archived']);

export async function updateCwTag(env: Env, id: number, patch: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(patch).filter(k => CW_TAG_UPDATABLE.has(k));
  if (cols.length === 0) return;
  const set = cols.map(c => `${c} = ?`).join(', ');
  const vals = cols.map(c => patch[c]);
  await env.DB.prepare(`UPDATE cw_tags SET ${set} WHERE id = ?`).bind(...vals, id).run();
}

export async function deleteCwTag(env: Env, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM cw_tags WHERE id = ?').bind(id).run();
}

export async function setTopicCwTags(env: Env, topicId: number, tagIds: number[]): Promise<void> {
  await env.DB.prepare('DELETE FROM topic_cw_tags WHERE topic_id = ?').bind(topicId).run();
  if (tagIds.length === 0) return;
  const stmts = tagIds.map(tid =>
    env.DB.prepare('INSERT OR IGNORE INTO topic_cw_tags (topic_id, cw_tag_id) VALUES (?, ?)').bind(topicId, tid)
  );
  await env.DB.batch(stmts);
}

export async function setPostCwTags(env: Env, postId: number, tagIds: number[]): Promise<void> {
  await env.DB.prepare('DELETE FROM post_cw_tags WHERE post_id = ?').bind(postId).run();
  if (tagIds.length === 0) return;
  const stmts = tagIds.map(tid =>
    env.DB.prepare('INSERT OR IGNORE INTO post_cw_tags (post_id, cw_tag_id) VALUES (?, ?)').bind(postId, tid)
  );
  await env.DB.batch(stmts);
}

export async function getCwTagsForTopics(env: Env, topicIds: number[]): Promise<Map<number, CwTag[]>> {
  const out = new Map<number, CwTag[]>();
  if (topicIds.length === 0) return out;
  const placeholders = topicIds.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT t.*, jt.topic_id AS _topic_id FROM cw_tags t
     JOIN topic_cw_tags jt ON jt.cw_tag_id = t.id
     WHERE jt.topic_id IN (${placeholders})
     ORDER BY t.sort_order ASC`
  ).bind(...topicIds).all<CwTag & { _topic_id: number }>();
  for (const row of res.results ?? []) {
    const arr = out.get(row._topic_id) ?? [];
    arr.push(row);
    out.set(row._topic_id, arr);
  }
  return out;
}

export async function getCwTagsForPosts(env: Env, postIds: number[]): Promise<Map<number, CwTag[]>> {
  const out = new Map<number, CwTag[]>();
  if (postIds.length === 0) return out;
  const placeholders = postIds.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT t.*, jt.post_id AS _post_id FROM cw_tags t
     JOIN post_cw_tags jt ON jt.cw_tag_id = t.id
     WHERE jt.post_id IN (${placeholders})
     ORDER BY t.sort_order ASC`
  ).bind(...postIds).all<CwTag & { _post_id: number }>();
  for (const row of res.results ?? []) {
    const arr = out.get(row._post_id) ?? [];
    arr.push(row);
    out.set(row._post_id, arr);
  }
  return out;
}

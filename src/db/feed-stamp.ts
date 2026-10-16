import type { Env } from '../types';

// Cheap "has the feed changed?" stamp for the 60s feed auto-refresh.
//
// The full refresh runs listRooms (per-room COUNT subqueries) plus the feed
// topics query. This stamp reads ~2 rows (MAX of an INTEGER PRIMARY KEY is a
// single B-tree seek), so an unchanged feed costs almost nothing: the poll
// gets 204 and swaps nothing.
//
// It moves when a topic or a reply is created - what changes the card list.
// Edits, deletes, pins and read-state are picked up on the next real activity
// or page navigation; that lag is the trade for not re-running the feed query.
export async function getFeedStamp(env: Env): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT (SELECT MAX(id) FROM topics) AS t, (SELECT MAX(id) FROM posts) AS p',
  ).first<{ t: number | null; p: number | null }>();
  return `${row?.t ?? 0}.${row?.p ?? 0}`;
}

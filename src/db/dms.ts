import { canSendMemberDm, decorateMembershipUser } from '../lib/membership-policy';
import { getUserById } from './users';
// Direct message persistence. Self-contained domain extracted from db.ts behind
// the db.ts re-export barrel (zero caller changes).
import type { Env, DM } from '../types';

export interface ConversationSummary {
  other_id: number;
  last_id: number;
  last_content: string;
  last_created_at: string;
}

/**
 * Id-cursor page of a user's conversations, newest activity first.
 *
 * Seeks dm_threads (the pointer table) instead of deriving conversations from
 * the user's whole dm history - the old CTE here had no LIMIT and scanned
 * everything on every /dms load. Index-backed by idx_dm_threads_user_seek, so
 * cost is flat at any depth. Fetches limit+1 to detect a further page.
 *
 * Ordering key is last_dm_id, not created_at. Equivalent in practice (both are
 * monotonic) and strictly better as a cursor: ids are unique, so no ties.
 *
 * Unread counts are NOT stored on dm_threads - see listUnreadCountsFor.
 */
export async function listConversations(
  env: Env,
  userId: number,
  limit: number,
  beforeId: number | null,
): Promise<{ conversations: ConversationSummary[]; nextBeforeId: number | null }> {
  const res = beforeId
    ? await env.DB.prepare(
        `SELECT t.other_id AS other_id,
                t.last_dm_id AS last_id,
                d.content AS last_content,
                d.created_at AS last_created_at
           FROM dm_threads t
           JOIN dms d ON d.id = t.last_dm_id
          WHERE t.user_id = ? AND t.last_dm_id < ?
          ORDER BY t.last_dm_id DESC
          LIMIT ?`
      ).bind(userId, beforeId, limit + 1).all<ConversationSummary>()
    : await env.DB.prepare(
        `SELECT t.other_id AS other_id,
                t.last_dm_id AS last_id,
                d.content AS last_content,
                d.created_at AS last_created_at
           FROM dm_threads t
           JOIN dms d ON d.id = t.last_dm_id
          WHERE t.user_id = ?
          ORDER BY t.last_dm_id DESC
          LIMIT ?`
      ).bind(userId, limit + 1).all<ConversationSummary>();

  let rows = res.results ?? [];
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  const last = rows[rows.length - 1];
  return { conversations: rows, nextBeforeId: hasMore && last ? last.last_id : null };
}

/**
 * Unread counts for one page of conversations, keyed by the other party's id.
 *
 * Deliberately computed rather than stored: a maintained counter over the
 * two-sided read_at column drifts. Bounded to the ~30 conversations actually on
 * screen and backed by idx_dms_recipient_read.
 */
export async function listUnreadCountsFor(
  env: Env,
  userId: number,
  otherIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (otherIds.length === 0) return counts;

  const placeholders = otherIds.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT sender_id AS other_id, COUNT(*) AS n
       FROM dms
      WHERE recipient_id = ? AND read_at IS NULL AND sender_id IN (${placeholders})
      GROUP BY sender_id`
  )
    .bind(userId, ...otherIds)
    .all<{ other_id: number; n: number }>();

  for (const row of res.results ?? []) counts.set(row.other_id, row.n);
  return counts;
}

/**
 * Point dm_threads at a newly created message, both directions.
 *
 * Two rows per message (one per side) so the inbox seek is a single-user index
 * range. Called on every insert path; the backfill migration uses the same
 * monotonic MAX() upsert, which is what makes re-running it safe.
 */
async function touchDmThreads(
  env: Env,
  senderId: number,
  recipientId: number,
  dmId: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO dm_threads (user_id, other_id, last_dm_id) VALUES (?, ?, ?), (?, ?, ?)
     ON CONFLICT(user_id, other_id) DO UPDATE SET last_dm_id = excluded.last_dm_id`
  )
    .bind(senderId, recipientId, dmId, recipientId, senderId, dmId)
    .run();
}

/**
 * Count a user's unread DMs. Index-backed by idx_dms_recipient_read
 * (recipient_id, read_at) - reads roughly one row per unread message, not the
 * user's whole DM history. Used by the nav unread badge, which only needs the
 * total; the heavy listConversations CTE is for the inbox page.
 */
export async function countUnreadDms(env: Env, userId: number): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dms WHERE recipient_id = ?1 AND read_at IS NULL`
  )
    .bind(userId)
    .first<{ n: number }>();
  return res?.n ?? 0;
}

/**
 * Newest page of a thread, returned oldest-first for display.
 *
 * Keyset, not the old unbounded "whole thread on every load". The pair
 * predicate is a two-way OR, so each direction is its own seek and the results
 * are merged - both branches ride idx_dms_recipient_seek
 * (recipient_id, sender_id, id), giving <=2*limit rows read at any depth.
 *
 * Each branch MUST stay wrapped in its own subquery: SQLite rejects
 * ORDER BY/LIMIT on a bare operand of a compound SELECT.
 *
 * Rows come back DESC (newest first) so the cursor is cheap to take, then are
 * reversed to ASC for rendering. nextBeforeId is the OLDEST id on the page.
 */
export async function listDmsWith(
  env: Env,
  userId: number,
  otherId: number,
  limit: number,
  beforeId: number | null,
): Promise<{ dms: DM[]; nextBeforeId: number | null }> {
  // Two statement shapes rather than a sentinel cursor: the first page omits
  // the id predicate entirely. Same split as listConversations and
  // listNotificationsPage. A MAX_SAFE_INTEGER sentinel would put every first
  // thread load on the worst-case integer-binding boundary for no benefit.
  const res = beforeId
    ? await env.DB.prepare(
        `SELECT * FROM (
           SELECT * FROM (
             SELECT * FROM dms
              WHERE sender_id = ? AND recipient_id = ? AND id < ?
              ORDER BY id DESC LIMIT ?
           )
           UNION ALL
           SELECT * FROM (
             SELECT * FROM dms
              WHERE sender_id = ? AND recipient_id = ? AND id < ?
              ORDER BY id DESC LIMIT ?
           )
         )
         ORDER BY id DESC LIMIT ?`
      ).bind(
        userId, otherId, beforeId, limit + 1,
        otherId, userId, beforeId, limit + 1,
        limit + 1,
      ).all<DM>()
    : await env.DB.prepare(
        `SELECT * FROM (
           SELECT * FROM (
             SELECT * FROM dms
              WHERE sender_id = ? AND recipient_id = ?
              ORDER BY id DESC LIMIT ?
           )
           UNION ALL
           SELECT * FROM (
             SELECT * FROM dms
              WHERE sender_id = ? AND recipient_id = ?
              ORDER BY id DESC LIMIT ?
           )
         )
         ORDER BY id DESC LIMIT ?`
      ).bind(
        userId, otherId, limit + 1,
        otherId, userId, limit + 1,
        limit + 1,
      ).all<DM>();

  let rows = res.results ?? [];
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  const oldest = rows[rows.length - 1];
  return {
    dms: rows.reverse(),
    nextBeforeId: hasMore && oldest ? oldest.id : null,
  };
}

export async function listDmsSince(
  env: Env,
  userId: number,
  otherId: number,
  sinceId: number
): Promise<DM[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM dms
       WHERE ((sender_id = ? AND recipient_id = ?)
          OR (sender_id = ? AND recipient_id = ?))
         AND id > ?
       ORDER BY created_at ASC, id ASC
       LIMIT 200`
  )
    .bind(userId, otherId, otherId, userId, sinceId)
    .all<DM>();
  return res.results ?? [];
}

export async function createDm(
  env: Env,
  senderId: number,
  recipientId: number,
  content: string
): Promise<DM> {
  const [senderRow, recipient] = await Promise.all([getUserById(env, senderId), getUserById(env, recipientId)]);
  const sender = await decorateMembershipUser(env, senderRow);
  if (!sender || !recipient || !canSendMemberDm(sender, recipient)) {
    throw new Error('Your communication privileges are currently restricted.');
  }

  const row = await env.DB.prepare(
    'INSERT INTO dms (sender_id, recipient_id, content) VALUES (?, ?, ?) RETURNING *'
  )
    .bind(senderId, recipientId, content)
    .first<DM>();

  if (!row) throw new Error('createDm failed');

  // Not a secondary effect: without this the conversation drops off both
  // parties' inboxes. Let it throw rather than swallow it.
  await touchDmThreads(env, senderId, recipientId, row.id);

  return row;
}

/** Any prior DM from sender to recipient? Used for one-shot bot onboarding. */
export async function hasDmFromTo(env: Env, senderId: number, recipientId: number): Promise<boolean> {
  const existing = await env.DB.prepare('SELECT 1 AS x FROM dms WHERE sender_id = ? AND recipient_id = ? LIMIT 1')
    .bind(senderId, recipientId).first<{ x: number }>();
  return existing !== null;
}

/**
 * Bare DM insert for the helper bot - deliberately skips createDm's
 * posting-restriction check and RETURNING (bot is server-controlled).
 */
export async function insertBotDm(env: Env, senderId: number, recipientId: number, content: string): Promise<void> {
  const row = await env.DB.prepare('INSERT INTO dms (sender_id, recipient_id, content) VALUES (?, ?, ?) RETURNING id')
    .bind(senderId, recipientId, content).first<{ id: number }>();
  if (row) await touchDmThreads(env, senderId, recipientId, row.id);
}

export async function markDmsRead(
  env: Env,
  userId: number,
  otherId: number
): Promise<void> {
  await env.DB.prepare(
    `UPDATE dms SET read_at = datetime('now')
       WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`
  )
    .bind(userId, otherId)
    .run();
}

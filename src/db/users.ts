import { newUserIntakeStatus } from '../lib/membership-policy';
import { roomReadVisibility } from './room-visibility';
import type { AccessLevel, Env, User } from '../types';

export async function getUserById(env: Env, id: number): Promise<User | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  return row ?? null;
}

/**
 * Batched user fetch by id. Runs one query (WHERE id IN (...)) instead of
 * calling getUserById N times. Returns a map id -> User; a missing id has
 * no map entry. Mirrors getUserById's `SELECT *` so callers get the same shape.
 */
export async function getUsersByIds(env: Env, ids: number[]): Promise<Map<number, User>> {
  const map = new Map<number, User>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT * FROM users WHERE id IN (${placeholders})`
  ).bind(...ids).all<User>();
  for (const u of res.results ?? []) map.set(u.id, u);
  return map;
}

export async function getUserDisplayName(env: Env, id: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(id).first<{ display_name: string }>();
  return row?.display_name ?? null;
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
  return row ?? null;
}

export async function getUserByDisplayName(env: Env, displayName: string): Promise<User | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE LOWER(display_name) = LOWER(?)')
    .bind(displayName)
    .first<User>();
  return row ?? null;
}

export async function listUsers(env: Env, limit: number = 50, offset: number = 0, q?: string): Promise<User[]> {
  const query = q?.trim();
  const where = query
    ? 'display_name IS NOT NULL AND is_banned = 0 AND display_name LIKE ?'
    : 'display_name IS NOT NULL AND is_banned = 0';
  const stmt = env.DB.prepare(
    `SELECT id, email, display_name, avatar_color, avatar_url, access_level, bio, is_banned, created_at FROM users WHERE ${where} ORDER BY display_name ASC LIMIT ? OFFSET ?`
  );
  const res = await (query ? stmt.bind(`%${query}%`, limit, offset) : stmt.bind(limit, offset)).all<User>();
  return res.results ?? [];
}

export async function searchUsers(
  env: Env,
  q: string,
  limit: number = 100,
  sort: UserSort = 'recent',
  filter: UserListFilter = {},
  offset: number = 0,
): Promise<User[]> {
  const query = q.trim();
  if (!query) return [];
  const like = `%${query}%`;
  const { sql: filterSql, binds: filterBinds } = userFilterClauses(filter);
  const orderBy = USER_SORT_SQL[sort] ?? USER_SORT_SQL.recent;
  const res = await env.DB.prepare(
    `SELECT *, ${LAST_VISIT_SUBQUERY}, ${CLUB_CAPABILITY_SUBQUERY} FROM users
     WHERE (display_name LIKE ? OR email LIKE ?)${filterSql}
     ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).bind(like, like, ...filterBinds, limit, offset).all<User>();
  return res.results ?? [];
}

export async function createUser(
  env: Env,
  email: string | null,
  passwordHash: string,
  isAdult: 0 | 1,
  tosVersion: number | null = null,
  passwordSalt: string | null = null,
  displayName: string | null = null
): Promise<User> {
  const row = await env.DB.prepare(
    `INSERT INTO users (email, password_hash, is_adult, tos_version, password_salt, display_name, intake_status)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(email, passwordHash, isAdult, tosVersion, passwordSalt, displayName, await newUserIntakeStatus(env)).first<User>();
  if (!row) throw new Error('createUser failed');
  return row;
}

export async function updateUserProfile(
  env: Env,
  id: number,
  displayName: string,
  bio: string | null,
  avatarColor: string,
  timezone: string,
  pronouns: string | null,
  twitterUrl: string | null,
  websiteUrl: string | null,
  signature: string | null,
  hideActivity: 0 | 1,
  hideBio: 0 | 1,
  avatarUrl: string | null,
  allowDms: number,
  coverImage: string | null = null,
  showNsfw: 0 | 1 = 0,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET
      display_name = ?, bio = ?, avatar_color = ?, timezone = ?,
      pronouns = ?, twitter_url = ?, website_url = ?, signature = ?,
      hide_activity = ?, hide_bio = ?, avatar_url = ?, allow_dms = ?,
      cover_image = ?, show_nsfw = ?
    WHERE id = ?`
  ).bind(
    displayName, bio, avatarColor, timezone,
    pronouns, twitterUrl, websiteUrl, signature,
    hideActivity, hideBio, avatarUrl, allowDms,
    coverImage, showNsfw, id
  ).run();
}

export async function updateChatIcon(env: Env, userId: number, icon: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET chat_icon = ?, last_icon_change = datetime('now') WHERE id = ?"
  ).bind(icon, userId).run();
}

export async function countUserActivity(env: Env, userId: number, viewerId?: number): Promise<{ topics: number, posts: number }> {
  const vis = roomReadVisibility(viewerId);
  const visible = `t.deleted_at IS NULL AND t.removed_at IS NULL AND t.status = 'approved' AND (t.require_review = 0 OR t.user_id = ? OR EXISTS (SELECT 1 FROM users v WHERE v.id = ? AND v.is_approved = 1 AND v.is_banned = 0 AND v.access_level IN ('mod','admin'))) AND ${vis.sql}`;
  const topics = await env.DB.prepare(`SELECT COUNT(*) as n FROM topics t JOIN rooms r ON r.id = t.room_id WHERE t.user_id = ? AND ${visible}`)
    .bind(userId, viewerId ?? 0, viewerId ?? 0, ...vis.params).first<{ n: number }>();
  const posts = await env.DB.prepare(`SELECT COUNT(*) as n FROM posts p JOIN topics t ON t.id = p.topic_id JOIN rooms r ON r.id = t.room_id WHERE p.user_id = ? AND p.deleted_at IS NULL AND p.status = 'approved' AND ${visible}`)
    .bind(userId, viewerId ?? 0, viewerId ?? 0, ...vis.params).first<{ n: number }>();
  return { topics: topics?.n ?? 0, posts: posts?.n ?? 0 };
}

export async function updateUserPassword(
  env: Env,
  id: number,
  passwordHash: string
): Promise<void> {
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, id)
    .run();
}

/**
 * Update password hash AND per-user salt together. Used by:
 *  - postReset, where we always generate a fresh salt on reset
 *  - postLogin, when lazy-migrating a legacy user (NULL salt) to the new
 *    per-user-salted hash on first successful login under the old global salt.
 */
export async function updateUserPasswordWithSalt(
  env: Env,
  id: number,
  passwordHash: string,
  passwordSalt: string
): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?'
  )
    .bind(passwordHash, passwordSalt, id)
    .run();
}

export async function setUserAccess(
  env: Env,
  id: number,
  access: AccessLevel
): Promise<void> {
  await env.DB.prepare("UPDATE users SET access_level = ?, intake_status = CASE WHEN ? IN ('full','mod','admin') THEN 'approved' ELSE intake_status END WHERE id = ?").bind(access, access, id).run();
}

export async function setUserBanned(
  env: Env,
  id: number,
  banned: 0 | 1
): Promise<void> {
  await env.DB.prepare('UPDATE users SET is_banned = ? WHERE id = ?').bind(banned, id).run();
}

export async function anonymizeUser(env: Env, id: number, banEmail = true): Promise<void> {
  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<{ email: string }>();
  if (banEmail && user?.email) {
    await env.DB.prepare('INSERT OR IGNORE INTO banned_emails (email) VALUES (?)').bind(user.email).run();
  }
  // Every table that references users(id) must be severed before deleting the
  // user, or a non-cascading FK (e.g. topic_follows, audit_logs, room_permissions)
  // aborts the whole batch with "FOREIGN KEY constraint failed".
  await env.DB.batch([
    env.DB.prepare('DELETE FROM membership_deliveries WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM membership_decisions WHERE application_id IN (SELECT id FROM membership_applications WHERE user_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM membership_applications WHERE user_id = ?').bind(id),
    env.DB.prepare('UPDATE membership_decisions SET actor_id = NULL WHERE actor_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM email_tokens WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM dms WHERE sender_id = ? OR recipient_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM upgrade_requests WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM poll_votes WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ban_appeals WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM mod_logs WHERE mod_id = ?').bind(id),
    env.DB.prepare('DELETE FROM reports WHERE reporter_id = ?').bind(id),
    env.DB.prepare('DELETE FROM topic_follows WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM audit_logs WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM room_permissions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM warning_replies WHERE user_id = ? OR warning_id IN (SELECT id FROM warnings WHERE user_id = ?)').bind(id, id),
    env.DB.prepare('DELETE FROM warnings WHERE user_id = ?').bind(id),
    env.DB.prepare('UPDATE warnings SET mod_id = NULL WHERE mod_id = ?').bind(id),
    env.DB.prepare('UPDATE warnings SET resolved_by = NULL WHERE resolved_by = ?').bind(id),
    // these cascade on delete, but clean explicitly in case FK enforcement is off
    env.DB.prepare('DELETE FROM user_badges WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM user_last_visit WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM post_reactions WHERE user_id = ?').bind(id),
    // keep authored content, just detach authorship
    env.DB.prepare('UPDATE topics SET user_id = NULL WHERE user_id = ?').bind(id),
    env.DB.prepare('UPDATE posts SET user_id = NULL WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
}

export async function appendModNote(
  env: Env,
  userId: number,
  line: string
): Promise<void> {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}`;
  await env.DB.prepare(
    "UPDATE users SET mod_note = COALESCE(mod_note || char(10), '') || ? WHERE id = ?"
  )
    .bind(entry, userId)
    .run();
}

export async function setEmailVerified(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE users SET email_verified = 1, is_approved = 1 WHERE id = ?').bind(id).run();
}

export async function updateUserTosVersion(env: Env, id: number, version: number): Promise<void> {
  await env.DB.prepare('UPDATE users SET tos_version = ? WHERE id = ?').bind(version, id).run();
}

export async function setUserReviewStatus(env: Env, userId: number, requireReview: number): Promise<void> {
  await env.DB.prepare('UPDATE users SET require_review = ? WHERE id = ?').bind(requireReview, userId).run();
}

export type UserListStatus = 'active' | 'pending' | 'all';
export type UserSort = 'recent' | 'name' | 'role' | 'active';
export interface UserListFilter {
  role?: 'member' | 'full' | 'mod' | 'admin';
  banned?: boolean;
  unverified?: boolean;
  review?: boolean;
}

// Whitelist - NEVER interpolate raw sort input into SQL.
const USER_SORT_SQL: Record<UserSort, string> = {
  recent: 'id DESC',
  name: 'display_name ASC',
  role: "CASE access_level WHEN 'admin' THEN 0 WHEN 'mod' THEN 1 WHEN 'full' THEN 2 ELSE 3 END, display_name ASC",
  active: 'last_visit_at DESC',
};

// Build "AND ..." filter clauses + bound params from flags.
function userFilterClauses(f: UserListFilter): { sql: string; binds: (string | number)[] } {
  const parts: string[] = [];
  const binds: (string | number)[] = [];
  if (f.role) { parts.push('access_level = ?'); binds.push(f.role); }
  if (f.banned) parts.push('is_banned = 1');
  if (f.unverified) parts.push('email_verified = 0');
  if (f.review) parts.push('require_review = 1');
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', binds };
}

const LAST_VISIT_SUBQUERY =
  '(SELECT MAX(lv.last_visited_at) FROM user_last_visit lv WHERE lv.user_id = users.id) AS last_visit_at';
const CLUB_CAPABILITY_SUBQUERY =
  "EXISTS(SELECT 1 FROM user_capabilities uc WHERE uc.user_id = users.id AND uc.capability = 'club') AS has_club";

export async function getRecentUsers(
  env: Env,
  limit: number,
  status: UserListStatus = 'all',
  sort: UserSort = 'recent',
  filter: UserListFilter = {},
  offset: number = 0,
): Promise<User[]> {
  const statusWhere =
    status === 'active'
      ? 'display_name IS NOT NULL'
      : status === 'pending'
        ? 'display_name IS NULL'
        : '1=1';
  const { sql: filterSql, binds: filterBinds } = userFilterClauses(filter);
  const orderBy = USER_SORT_SQL[sort] ?? USER_SORT_SQL.recent;
  const res = await env.DB.prepare(
    `SELECT *, ${LAST_VISIT_SUBQUERY}, ${CLUB_CAPABILITY_SUBQUERY} FROM users WHERE ${statusWhere}${filterSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  )
    .bind(...filterBinds, limit, offset)
    .all<User>();
  return res.results ?? [];
}

export async function getUserCounts(env: Env): Promise<{ active: number; pending: number; total: number }> {
  const row = await env.DB.prepare(
    `SELECT
       COUNT(CASE WHEN display_name IS NOT NULL THEN 1 END) AS active,
       COUNT(CASE WHEN display_name IS NULL THEN 1 END) AS pending,
       COUNT(*) AS total
     FROM users`
  ).first<{ active: number; pending: number; total: number }>();
  return { active: row?.active ?? 0, pending: row?.pending ?? 0, total: row?.total ?? 0 };
}

export async function updateModNote(env: Env, userId: number, note: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET mod_note = ? WHERE id = ?').bind(note, userId).run();
}

// Partial update for admin user edits. Whitelist columns to prevent SQL injection.
export const USER_UPDATABLE = new Set([
  'display_name',
  'bio',
  'avatar_color',
  'timezone',
  'pronouns',
  'twitter_url',
  'website_url',
  'signature',
  'avatar_url',
  'cover_image',
  'hide_activity',
  'hide_bio',
  'show_nsfw',
  'mod_note',
  'review_notes',
  'allow_dms'
]);

export async function updateUserPartial(
  env: Env,
  id: number,
  partial: Record<string, unknown>
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(partial)) {
    if (!USER_UPDATABLE.has(k)) continue;
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  if (cols.length === 0) return;
  vals.push(id);
  await env.DB.prepare(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`).bind(...vals).run();
}

/** Lift a moderator-imposed posting restriction. */
export async function clearPostingRestriction(env: Env, userId: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET posting_restricted_at = NULL, posting_restriction_reason = NULL WHERE id = ?'
  ).bind(userId).run();
}

/** Verified users still on the unsalted password scheme, not yet emailed. */
export async function listSaltMigrationTargets(env: Env): Promise<{ id: number; email: string }[]> {
  const targets = await env.DB.prepare(
    `SELECT u.id, u.email
       FROM users u
      WHERE u.password_salt IS NULL
        AND u.email_verified = 1
        AND NOT EXISTS (
          SELECT 1 FROM mod_logs
           WHERE action = 'salt_migration_email'
             AND target_type = 'user'
             AND target_id = u.id
        )`
  ).all<{ id: number; email: string }>();
  return targets.results ?? [];
}

export async function setReviewNotes(env: Env, userId: number, notes: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET review_notes = ? WHERE id = ?').bind(notes, userId).run();
}

/** Id-echo lookup that also filters banned accounts (bot sender validation). */
export async function getUnbannedUserId(env: Env, id: number): Promise<{ id: number } | null> {
  return env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_banned = 0')
    .bind(id).first<{ id: number }>();
}

export async function isEmailBanned(env: Env, email: string): Promise<boolean> {
  const banned = await env.DB.prepare('SELECT 1 FROM banned_emails WHERE email = ?').bind(email).first();
  return banned !== null;
}


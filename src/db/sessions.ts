import type { EmailToken, EmailTokenKind, Env, Session, User } from '../types';

export async function getSession(env: Env, token: string): Promise<Session | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM sessions WHERE token = ? AND julianday(expires_at) > julianday('now')"
  )
    .bind(token)
    .first<Session>();
  return row ?? null;
}

export async function createSession(
  env: Env,
  token: string,
  userId: number,
  expiresAt: string
): Promise<Session> {
  const row = await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?) RETURNING *'
  )
    .bind(token, userId, expiresAt)
    .first<Session>();
  if (!row) throw new Error('createSession failed');
  return row;
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function deleteAllSessionsForUser(env: Env, userId: number): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

// ---------- session+user join (for middleware) ----------

export async function getSessionUser(env: Env, token: string): Promise<User | null> {
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND julianday(s.expires_at) > julianday('now')`
  ).bind(token).first<User>();
  return row ?? null;
}

// ---------- email tokens ----------

export async function createEmailToken(
  env: Env,
  token: string,
  userId: number,
  kind: EmailTokenKind,
  expiresAt: string
): Promise<EmailToken> {
  const row = await env.DB.prepare(
    'INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?) RETURNING *'
  )
    .bind(token, userId, kind, expiresAt)
    .first<EmailToken>();
  if (!row) throw new Error('createEmailToken failed');
  return row;
}

export async function consumeEmailToken(
  env: Env,
  token: string,
  kind: EmailTokenKind
): Promise<EmailToken | null> {
  return await env.DB.prepare(
    "DELETE FROM email_tokens WHERE token = ? AND kind = ? AND julianday(expires_at) > julianday('now') RETURNING *"
  ).bind(token, kind).first<EmailToken>();
}

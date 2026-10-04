import { newUserIntakeStatus } from './membership-policy';
import type { Env, User } from '../types';
import { generateToken } from '../auth';

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function createInvite(env: Env, adminId: number): Promise<string> {
  const token = generateToken();
  await env.DB.prepare('INSERT INTO invitations (token_hash, created_by, expires_at) VALUES (?, ?, ?)')
    .bind(await tokenHash(token), adminId, new Date(Date.now() + 7 * 86400000).toISOString()).run();
  return token;
}

/** D1 batches are transactional. A duplicate claim fails and rolls back all writes. */
export async function createInvitedUser(env: Env, token: string, username: string, passwordHash: string, salt: string, tosVersion: number, isAdult: 0 | 1 = 0): Promise<User | null> {
  const digest = await tokenHash(token);
  const valid = await env.DB.prepare("SELECT token_hash FROM invitations WHERE token_hash = ? AND claimed_at IS NULL AND expires_at > ?")
    .bind(digest, new Date().toISOString()).first();
  if (!valid) return null;
  const intakeStatus = await newUserIntakeStatus(env);
  const claimKey = `invite_claim:${digest}`;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO settings (key, value) SELECT ?, 'claimed'
        WHERE EXISTS (SELECT 1 FROM invitations WHERE token_hash = ? AND claimed_at IS NULL AND expires_at > ?)`)
        .bind(claimKey, digest, new Date().toISOString()),
      env.DB.prepare(`INSERT INTO users (display_name, password_hash, password_salt, is_approved, tos_version, is_adult, intake_status)
        SELECT ?, ?, ?, 1, ?, ?, ? WHERE changes() = 1 RETURNING *`).bind(username, passwordHash, salt, tosVersion, isAdult, intakeStatus),
      env.DB.prepare(`UPDATE invitations SET claimed_by = (SELECT id FROM users WHERE display_name = ?), claimed_at = ?
        WHERE token_hash = ? AND changes() = 1`).bind(username, new Date().toISOString(), digest),
    ]);
    return (results[1]?.results?.[0] as unknown as User) || null;
  } catch (error) {
    // A raced claim is expected. Other constraint failures still leave the invite unused.
    const claimed = await env.DB.prepare('SELECT claimed_by FROM invitations WHERE token_hash = ?').bind(digest).first<{ claimed_by: number | null }>();
    if (claimed?.claimed_by) return null;
    throw error;
  }
}

#!/usr/bin/env node
// Password stays out of command arguments, logs and SQL. Run from the repository root.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const username = args[0];
const fileAt = args.indexOf('--password-file');
if (!username || !/^[a-zA-Z0-9_-]{3,32}$/.test(username) || fileAt < 0 || !args[fileAt + 1]) {
  console.error('Usage: node scripts/recover-owner.mjs USERNAME --password-file PRIVATE_FILE [--local]');
  process.exit(1);
}
const password = readFileSync(args[fileAt + 1], 'utf8').replace(/\r?\n$/, '');
if (password.length < 8 || password.length > 256) {
  console.error('Password must have 8 to 256 characters.');
  process.exit(1);
}
const salt = randomBytes(16).toString('base64');
const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64');
const dir = mkdtempSync(join(tmpdir(), 'extb-recovery-'));
try {
  const sqlFile = join(dir, 'recovery.sql');
  const sql = `UPDATE users SET password_hash = '${hash}', password_salt = '${salt}' WHERE display_name = '${username}' COLLATE NOCASE AND access_level = 'admin' AND is_banned = 0;
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE display_name = '${username}' COLLATE NOCASE AND access_level = 'admin' AND is_banned = 0);`;
  writeFileSync(sqlFile, sql, { mode: 0o600 });
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', args.includes('--local') ? '--local' : '--remote', '--file', sqlFile], { encoding: 'utf8' });
  if (run.status !== 0) {
    console.error('Recovery failed. Check Cloudflare authentication and the DB binding.');
    process.exitCode = 1;
  } else {
    console.log('Recovery command completed. Existing sessions for the matching active admin were removed.');
  }
} finally { rmSync(dir, { recursive: true, force: true }); }

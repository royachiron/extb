CREATE TABLE IF NOT EXISTS admin_api_tokens (
 id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_api_audit (
 id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL, token_id INTEGER,
 action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_delete_confirmations (
 token_hash TEXT PRIMARY KEY, actor_id INTEGER NOT NULL, api_token_id INTEGER,
 target_type TEXT NOT NULL, target_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admin_delete_guards (token_hash TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid = 1));

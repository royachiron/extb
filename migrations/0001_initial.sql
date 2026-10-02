-- All timestamps: TEXT via datetime('now'). All booleans: INTEGER 0/1.

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  email          TEXT UNIQUE,
  display_name   TEXT COLLATE NOCASE UNIQUE,
  password_hash  TEXT NOT NULL,
  bio            TEXT,
  avatar_color   TEXT DEFAULT '#6366f1',
  access_level   TEXT DEFAULT 'member',
  email_verified INTEGER DEFAULT 0,
  is_approved    INTEGER NOT NULL DEFAULT 0,
  is_adult       INTEGER DEFAULT 0,
  is_banned      INTEGER DEFAULT 0,
  mod_note                   TEXT,
  created_at                 TEXT DEFAULT (datetime('now')),
  timezone       TEXT DEFAULT 'UTC',
  pronouns       TEXT,
  twitter_url    TEXT,
  website_url    TEXT,
  cover_image    TEXT,
  hide_activity  INTEGER DEFAULT 0,
  hide_bio       INTEGER DEFAULT 0,
  chat_icon      TEXT,
  last_icon_change TEXT,
  signature      TEXT,
  avatar_url     TEXT,
  allow_dms      INTEGER DEFAULT 1,
  posting_restricted_at      TEXT,
  posting_restriction_reason TEXT,
  tos_version    INTEGER DEFAULT NULL,
  monthly_upload_bytes INTEGER NOT NULL DEFAULT 0,
  monthly_upload_month TEXT,
  password_salt  TEXT,
  show_nsfw      INTEGER NOT NULL DEFAULT 0,
  review_notes   TEXT NOT NULL DEFAULT '',
  require_review INTEGER DEFAULT 0,
  threads_read_before TEXT
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE email_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE rooms (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  description  TEXT,
  icon         TEXT,
  kind         TEXT NOT NULL,
  min_read     TEXT DEFAULT 'anon',
  min_post     TEXT DEFAULT 'member',
  sort_order   INTEGER DEFAULT 0,
  is_locked    INTEGER DEFAULT 0,
  is_exclusive INTEGER DEFAULT 0,
  is_page      INTEGER DEFAULT 0,
  is_archived  INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE room_permissions (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  access_type TEXT NOT NULL CHECK(access_type IN ('blocked', 'read', 'full')),
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  granted_by INTEGER REFERENCES users(id),
  note       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, capability)
);

CREATE TABLE topics (
  id            INTEGER PRIMARY KEY,
  room_id       INTEGER NOT NULL REFERENCES rooms(id),
  user_id       INTEGER REFERENCES users(id),
  anon_name     TEXT,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  tags          TEXT,
  status        TEXT DEFAULT 'approved',
  is_pinned     INTEGER DEFAULT 0,
  is_locked     INTEGER DEFAULT 0,
  reply_count   INTEGER DEFAULT 0,
  last_reply_at TEXT DEFAULT (datetime('now')),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT,
  deleted_at    TEXT,
  delete_reason TEXT,
  deleted_by    INTEGER REFERENCES users(id),
  removed_at    TEXT,
  removed_by    INTEGER REFERENCES users(id),
  short_id          TEXT,
  require_review    INTEGER DEFAULT 0,
  delete_on_approve INTEGER DEFAULT 0
);

CREATE TABLE posts (
  id            INTEGER PRIMARY KEY,
  topic_id      INTEGER NOT NULL REFERENCES topics(id),
  user_id       INTEGER REFERENCES users(id),
  anon_name     TEXT,
  content       TEXT NOT NULL,
  status        TEXT DEFAULT 'approved',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT,
  deleted_at    TEXT,
  delete_reason TEXT,
  deleted_by    INTEGER REFERENCES users(id),
  removed_at    TEXT,
  removed_by    INTEGER REFERENCES users(id),
  archived_at     TEXT,
  archived_by     INTEGER REFERENCES users(id),
  parent_post_id  INTEGER REFERENCES posts(id),
  depth           INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE posts_fts USING fts5(content, content='posts', content_rowid='id');

-- Trigger to sync FTS5 table
CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO posts_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  url        TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  type       TEXT NOT NULL DEFAULT 'other' -- 'mention' | 'reply' | 'warning' | 'other'
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE reports (
  id              INTEGER PRIMARY KEY,
  reporter_id     INTEGER NOT NULL REFERENCES users(id),
  content_type    TEXT NOT NULL,
  content_id      INTEGER NOT NULL,
  reason          TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TEXT DEFAULT (datetime('now')),
  detail          TEXT,
  resolved_by     INTEGER REFERENCES users(id),
  resolved_at     TEXT,
  resolution_note TEXT
);

CREATE UNIQUE INDEX idx_reports_dedupe ON reports(reporter_id, content_type, content_id);
CREATE INDEX idx_reports_status_created ON reports(status, created_at);
CREATE INDEX idx_reports_reporter_created ON reports(reporter_id, created_at);

CREATE TABLE dms (
  id           INTEGER PRIMARY KEY,
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  content      TEXT NOT NULL,
  read_at      TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Inbox pointer table: one row per (user, other) side holding that pair's
-- newest message id. Makes the conversation list an index seek at any depth
-- instead of a CTE over the user's whole dm history. See
-- migration_dm_threads.sql. Fresh DBs need no backfill.
CREATE TABLE dm_threads (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  other_id   INTEGER NOT NULL REFERENCES users(id),
  last_dm_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, other_id)
);

CREATE TABLE upgrade_requests (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  note        TEXT,
  status      TEXT DEFAULT 'pending',
  mod_reason  TEXT,
  handled_by  INTEGER REFERENCES users(id),
  created_at  TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_sessions_token         ON sessions(token);
CREATE INDEX idx_email_tokens_token     ON email_tokens(token);
CREATE INDEX idx_topics_room_lastreply  ON topics(room_id, last_reply_at DESC);
CREATE INDEX idx_posts_topic_created    ON posts(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_topic_parent ON posts(topic_id, parent_post_id);
CREATE INDEX idx_dms_recipient_read     ON dms(recipient_id, read_at);
CREATE INDEX idx_dms_sender              ON dms(sender_id);
-- Thread keyset. Serves BOTH pair directions: sender_id and recipient_id are
-- both equality-matched, so column order between them is irrelevant, and the
-- trailing id gives the range seek + ordering.
CREATE INDEX IF NOT EXISTS idx_dms_recipient_seek ON dms(recipient_id, sender_id, id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_seek ON dm_threads(user_id, last_dm_id DESC);
CREATE INDEX idx_users_display_name     ON users(display_name);
CREATE INDEX idx_users_email            ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_capabilities_capability ON user_capabilities(capability, user_id);
-- Partial indexes for the hot status='approved' AND deleted_at IS NULL predicate (perf: D1 rows-read).
CREATE INDEX IF NOT EXISTS idx_topics_room_active   ON topics(room_id, last_reply_at DESC) WHERE status='approved' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topics_user_active   ON topics(user_id)                     WHERE status='approved' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_topic_active   ON posts(topic_id)                     WHERE status='approved' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_active_created ON posts(created_at DESC)              WHERE status='approved' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_user_active    ON posts(user_id)                      WHERE status='approved' AND deleted_at IS NULL;
CREATE VIRTUAL TABLE IF NOT EXISTS topics_fts USING fts5(title, content, tags, content='topics', content_rowid='id');

-- Trigger to sync FTS5 table
CREATE TRIGGER IF NOT EXISTS topics_ai AFTER INSERT ON topics BEGIN
  INSERT INTO topics_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS topics_ad AFTER DELETE ON topics BEGIN
  INSERT INTO topics_fts(topics_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS topics_au AFTER UPDATE ON topics BEGIN
  INSERT INTO topics_fts(topics_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO topics_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;

-- Rebuild the index for existing topics
INSERT INTO topics_fts(topics_fts) VALUES('rebuild');

CREATE TABLE IF NOT EXISTS chat_presence (
  name      TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL,
  room_id INTEGER REFERENCES rooms(id)
);

CREATE TABLE polls (
  id           INTEGER PRIMARY KEY,
  topic_id     INTEGER NOT NULL REFERENCES topics(id),
  question     TEXT NOT NULL,
  multi_select INTEGER DEFAULT 0,
  ends_at      TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE poll_options (
  id      INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  text    TEXT NOT NULL
);

CREATE TABLE poll_votes (
  id        INTEGER PRIMARY KEY,
  poll_id   INTEGER NOT NULL REFERENCES polls(id),
  option_id INTEGER NOT NULL REFERENCES poll_options(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(poll_id, user_id, option_id)
);

CREATE TABLE mod_logs (
  id          INTEGER PRIMARY KEY,
  mod_id      INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ban_appeals (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT DEFAULT 'pending', -- pending, approved, rejected
  mod_id      INTEGER REFERENCES users(id),
  mod_note    TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX idx_mod_logs_mod ON mod_logs(mod_id);
CREATE INDEX idx_ban_appeals_user ON ban_appeals(user_id);
CREATE INDEX idx_ban_appeals_status ON ban_appeals(status);

CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_subs_user_id ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS user_topic_read (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id     INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_user_topic_read_topic ON user_topic_read(topic_id);

CREATE TABLE IF NOT EXISTS warnings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  mod_id      INTEGER REFERENCES users(id),
  target_type TEXT NOT NULL DEFAULT 'post',
  target_id   INTEGER,
  target_content TEXT,
  internal_memo TEXT,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolve_memo TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warning_replies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  warning_id  INTEGER NOT NULL REFERENCES warnings(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  hide_author INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_warnings_user ON warnings(user_id);
CREATE INDEX idx_warnings_mod ON warnings(mod_id);
CREATE INDEX idx_warnings_resolved ON warnings(resolved_at);
CREATE INDEX idx_warning_replies_warning ON warning_replies(warning_id);

CREATE TABLE cw_tags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#6b7280',
  is_spoiler   INTEGER NOT NULL DEFAULT 0,
  is_nsfw      INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE topic_cw_tags (
  topic_id   INTEGER NOT NULL,
  cw_tag_id  INTEGER NOT NULL,
  PRIMARY KEY (topic_id, cw_tag_id),
  FOREIGN KEY (topic_id)  REFERENCES topics(id)  ON DELETE CASCADE,
  FOREIGN KEY (cw_tag_id) REFERENCES cw_tags(id) ON DELETE CASCADE
);

CREATE TABLE post_cw_tags (
  post_id    INTEGER NOT NULL,
  cw_tag_id  INTEGER NOT NULL,
  PRIMARY KEY (post_id, cw_tag_id),
  FOREIGN KEY (post_id)   REFERENCES posts(id)   ON DELETE CASCADE,
  FOREIGN KEY (cw_tag_id) REFERENCES cw_tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_topic_cw_tags_tag ON topic_cw_tags(cw_tag_id);
CREATE INDEX idx_post_cw_tags_tag  ON post_cw_tags(cw_tag_id);

CREATE TABLE invitations (
  token_hash TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  claimed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TEXT
);

CREATE TABLE badges (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL DEFAULT '#6366f1', text_color TEXT NOT NULL DEFAULT '#ffffff',
 shape TEXT NOT NULL DEFAULT 'pill', description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE user_badges (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'have' CHECK(status IN ('have', 'need')),
 PRIMARY KEY(user_id, badge_id)
);
CREATE TABLE banned_emails (email TEXT PRIMARY KEY);
CREATE TABLE chat_messages (
 id INTEGER PRIMARY KEY, author_name TEXT NOT NULL, content TEXT NOT NULL, ip TEXT,
 scope TEXT NOT NULL DEFAULT 'room:chat', author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 reply_to_id INTEGER REFERENCES chat_messages(id), reply_to_author TEXT, reply_to_excerpt TEXT,
 deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chat_messages_scope ON chat_messages(scope, id);
CREATE TABLE chat_reactions (
 id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(message_id, user_id, emoji)
);
CREATE TABLE forum_view_events (
 id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_forum_views_created ON forum_view_events(created_at);
CREATE TABLE user_last_visit (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 last_visited_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(user_id, room_id)
);
CREATE TABLE post_reactions (
 id INTEGER PRIMARY KEY, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
 topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 emoji TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK((post_id IS NOT NULL) != (topic_id IS NOT NULL)),
 UNIQUE(post_id, user_id, emoji), UNIQUE(topic_id, user_id, emoji)
);
CREATE TABLE topic_follows (
 topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(topic_id, user_id)
);
CREATE TABLE user_blocks (
 blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(blocker_id, blocked_id)
);
CREATE TABLE audit_logs (
 id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
 details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

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

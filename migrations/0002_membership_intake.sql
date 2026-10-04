-- Optional membership review: existing accounts remain outside intake.
ALTER TABLE users ADD COLUMN intake_status TEXT NOT NULL DEFAULT 'none'
  CHECK(intake_status IN ('none','applicant','pending','declined','approved'));
CREATE TABLE membership_applications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  introduction_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  application_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  staff_notes TEXT NOT NULL DEFAULT '',
  decision_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE UNIQUE INDEX membership_pending_user ON membership_applications(user_id) WHERE status='pending';
CREATE INDEX membership_applications_user ON membership_applications(user_id,id DESC);
CREATE TABLE membership_decisions (
  application_id INTEGER PRIMARY KEY REFERENCES membership_applications(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','declined')),
  reason TEXT NOT NULL DEFAULT '',
  staff_notes TEXT NOT NULL DEFAULT '',
  claim_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE membership_deliveries (
  delivery_key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_token TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'claimed' CHECK(state IN ('claimed','sent','uncertain')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE dms ADD COLUMN membership_delivery_key TEXT;
CREATE UNIQUE INDEX dms_membership_delivery ON dms(membership_delivery_key) WHERE membership_delivery_key IS NOT NULL;

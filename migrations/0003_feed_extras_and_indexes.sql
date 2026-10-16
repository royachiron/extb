-- Richer feed cards (view counts) + moderator feed composite indexes
ALTER TABLE topics ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_topics_live_pinned_lastreply
  ON topics(is_pinned DESC, last_reply_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topics_room_live_pinned_lastreply
  ON topics(room_id, is_pinned DESC, last_reply_at DESC) WHERE deleted_at IS NULL;

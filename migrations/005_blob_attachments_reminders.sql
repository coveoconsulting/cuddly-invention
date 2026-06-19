-- 005_blob_attachments_reminders.sql
-- Move signatures to Vercel Blob, add quote attachments, add reminder tracking.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS signature_url        TEXT,
  ADD COLUMN IF NOT EXISTS last_reminder_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count       INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_attachments (
  id                    TEXT PRIMARY KEY,
  quote_id              TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  blob_url              TEXT NOT NULL,
  size_bytes            BIGINT NOT NULL DEFAULT 0,
  content_type          TEXT NOT NULL DEFAULT '',
  uploaded_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  visible_to_client     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_attachments_quote_idx ON quote_attachments(quote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_reminder_idx ON quotes(status, last_reminder_at) WHERE status = 'sent';

-- 003_whatsapp.sql
-- WhatsApp Cloud API (Meta) integration: settings + contacts + messages.

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id                     TEXT PRIMARY KEY DEFAULT 'default',
  phone_number_id        TEXT NOT NULL DEFAULT '',
  business_account_id    TEXT NOT NULL DEFAULT '',
  access_token           TEXT NOT NULL DEFAULT '',
  verify_token           TEXT NOT NULL DEFAULT '',
  app_secret             TEXT NOT NULL DEFAULT '',
  display_phone_number   TEXT NOT NULL DEFAULT '',
  default_language       TEXT NOT NULL DEFAULT 'fr',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id                TEXT PRIMARY KEY,
  phone             TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL DEFAULT '',
  profile_name      TEXT NOT NULL DEFAULT '',
  client_id         TEXT REFERENCES clients(id) ON DELETE SET NULL,
  prospect_id       TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  last_message_at   TIMESTAMPTZ,
  last_inbound_at   TIMESTAMPTZ,
  unread_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_contacts_last_idx
  ON whatsapp_contacts(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                TEXT PRIMARY KEY,
  contact_id        TEXT NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  wa_message_id     TEXT UNIQUE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type      TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN (
                      'text','image','document','audio','video','sticker',
                      'template','location','reaction','system'
                    )),
  body              TEXT NOT NULL DEFAULT '',
  media_url         TEXT,
  media_mime        TEXT,
  media_filename    TEXT,
  template_name     TEXT,
  status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN (
                      'queued','sent','delivered','read','failed','received'
                    )),
  error_message     TEXT,
  sent_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_contact_idx
  ON whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx
  ON whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

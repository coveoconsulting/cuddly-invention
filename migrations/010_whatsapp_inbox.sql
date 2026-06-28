-- 010_whatsapp_inbox.sql
-- Team inbox: allow assigning a WhatsApp conversation to a sales rep.

ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_contacts_assigned_idx
  ON whatsapp_contacts(assigned_user_id);

-- 004_crm_flow.sql
-- CRM lifecycle: comments (any entity), quotes + lines, CRM settings, signature audit.

CREATE TABLE IF NOT EXISTS crm_settings (
  id                       TEXT PRIMARY KEY DEFAULT 'default',
  quote_number_prefix      TEXT NOT NULL DEFAULT 'DEV',
  quote_number_counter     INTEGER NOT NULL DEFAULT 0,
  quote_validity_days      INTEGER NOT NULL DEFAULT 30,
  default_tax_rate         NUMERIC(6,3) NOT NULL DEFAULT 20.000,
  default_payment_terms    TEXT NOT NULL DEFAULT 'Paiement à 30 jours.',
  default_quote_terms      TEXT NOT NULL DEFAULT 'Devis valable 30 jours. Acceptation par signature.',
  legal_mentions           TEXT NOT NULL DEFAULT '',
  quote_email_subject      TEXT NOT NULL DEFAULT 'Votre devis {{number}}',
  quote_email_body         TEXT NOT NULL DEFAULT 'Bonjour,\n\nVeuillez trouver votre devis ci-joint.\nVous pouvez le signer en ligne ici : {{link}}\n\nCordialement.',
  signature_token_secret   TEXT NOT NULL DEFAULT '',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO crm_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS comments (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN (
                    'client','prospect','opportunity','quote','order','visit'
                  )),
  entity_id       TEXT NOT NULL,
  author_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_entity_idx
  ON comments(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quotes (
  id                  TEXT PRIMARY KEY,
  number              TEXT NOT NULL UNIQUE,
  client_id           TEXT REFERENCES clients(id) ON DELETE SET NULL,
  prospect_id         TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  opportunity_id      TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  owner_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  territory_id        TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft','sent','signed','refused','expired','cancelled'
                      )),
  title               TEXT NOT NULL DEFAULT '',
  client_name         TEXT NOT NULL,
  client_contact      TEXT NOT NULL DEFAULT '',
  client_email        TEXT NOT NULL DEFAULT '',
  client_address      TEXT NOT NULL DEFAULT '',
  currency            TEXT NOT NULL DEFAULT 'MAD',
  tax_rate            NUMERIC(6,3) NOT NULL DEFAULT 20.000,
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes               TEXT NOT NULL DEFAULT '',
  terms               TEXT NOT NULL DEFAULT '',
  payment_terms       TEXT NOT NULL DEFAULT '',
  issued_at           TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  signed_at           TIMESTAMPTZ,
  signed_by_name      TEXT,
  signed_by_email     TEXT,
  signature_data_url  TEXT,
  signature_ip        TEXT,
  refused_reason      TEXT,
  order_id            TEXT REFERENCES orders(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_client_idx      ON quotes(client_id);
CREATE INDEX IF NOT EXISTS quotes_prospect_idx    ON quotes(prospect_id);
CREATE INDEX IF NOT EXISTS quotes_opportunity_idx ON quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS quotes_status_idx      ON quotes(status);
CREATE INDEX IF NOT EXISTS quotes_owner_idx       ON quotes(owner_user_id);

DROP TRIGGER IF EXISTS quotes_set_updated_at ON quotes;
CREATE TRIGGER quotes_set_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS quote_lines (
  id                TEXT PRIMARY KEY,
  quote_id          TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
  description       TEXT NOT NULL,
  quantity          NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent  NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total        NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS quote_lines_quote_idx ON quote_lines(quote_id, position);

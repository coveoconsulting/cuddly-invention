-- Operational modules: order lines, contracts, support cases, campaigns and calls.

ALTER TABLE integrations ADD COLUMN IF NOT EXISTS endpoint_url TEXT NOT NULL DEFAULT '';
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS order_lines (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name      TEXT NOT NULL DEFAULT '',
  quantity          NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent  NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total        NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS order_lines_order_idx ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL CHECK (status IN ('draft','active','renewal_due','expired','cancelled')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  renewal_date    DATE,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'MAD',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_owner_idx ON contracts(owner_user_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_renewal_idx ON contracts(renewal_date);

CREATE TABLE IF NOT EXISTS cases (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL CHECK (status IN ('open','pending','resolved','closed')),
  priority        TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  category        TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  resolution      TEXT NOT NULL DEFAULT '',
  due_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cases_owner_idx ON cases(owner_user_id);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status);
CREATE INDEX IF NOT EXISTS cases_due_idx ON cases(due_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','phone')),
  status          TEXT NOT NULL CHECK (status IN ('draft','scheduled','running','completed','paused')),
  audience        TEXT NOT NULL DEFAULT '',
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_at    TIMESTAMPTZ,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  response_count  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_owner_idx ON campaigns(owner_user_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);
CREATE INDEX IF NOT EXISTS campaigns_scheduled_idx ON campaigns(scheduled_at);

CREATE TABLE IF NOT EXISTS sales_calls (
  id                TEXT PRIMARY KEY,
  subject           TEXT NOT NULL,
  phone             TEXT NOT NULL DEFAULT '',
  client_id         TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name       TEXT NOT NULL,
  owner_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL CHECK (status IN ('planned','completed','missed')),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_calls_owner_idx ON sales_calls(owner_user_id);
CREATE INDEX IF NOT EXISTS sales_calls_status_idx ON sales_calls(status);
CREATE INDEX IF NOT EXISTS sales_calls_scheduled_idx ON sales_calls(scheduled_at);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['contracts','cases','campaigns','sales_calls']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_set_updated_at ON %I; '
      || 'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

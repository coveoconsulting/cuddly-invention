-- 001_init.sql
-- Initial normalized schema for the force commerciale terrain CRM.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vertical      TEXT NOT NULL,
  currency      TEXT NOT NULL,
  timezone      TEXT NOT NULL,
  country       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS territories (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  region        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  manager_user_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  initials      TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN (
                  'super_admin','admin','director','manager',
                  'sales_rep','finance','logistics','support','viewer'
                )),
  team_id       TEXT REFERENCES teams(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_team_idx ON users(team_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS user_territories (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  territory_id TEXT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, territory_id)
);

CREATE INDEX IF NOT EXISTS user_territories_territory_idx ON user_territories(territory_id);

CREATE TABLE IF NOT EXISTS clients (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('prospect','client')),
  status          TEXT NOT NULL CHECK (status IN ('active','inactive','blocked')),
  segment         TEXT NOT NULL CHECK (segment IN ('A','B','C')),
  address         TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  zone            TEXT NOT NULL DEFAULT '',
  territory_id    TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_name    TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  potential_score INTEGER NOT NULL DEFAULT 0 CHECK (potential_score BETWEEN 0 AND 100),
  financial_risk  TEXT NOT NULL DEFAULT 'low' CHECK (financial_risk IN ('low','medium','high')),
  last_visit      DATE,
  next_visit      DATE,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_owner_idx     ON clients(owner_user_id);
CREATE INDEX IF NOT EXISTS clients_territory_idx ON clients(territory_id);
CREATE INDEX IF NOT EXISTS clients_status_idx    ON clients(status);

CREATE TABLE IF NOT EXISTS visits (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name        TEXT NOT NULL,
  address            TEXT NOT NULL DEFAULT '',
  city               TEXT NOT NULL DEFAULT '',
  objective          TEXT NOT NULL DEFAULT '',
  scheduled_date     DATE NOT NULL,
  start_time         TEXT NOT NULL DEFAULT '09:00',
  end_time           TEXT NOT NULL DEFAULT '10:00',
  status             TEXT NOT NULL CHECK (status IN (
                       'planned','in_progress','completed','missed','cancelled'
                     )),
  owner_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  territory_id       TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  report             TEXT NOT NULL DEFAULT '',
  next_action        TEXT NOT NULL DEFAULT '',
  check_in_at        TIMESTAMPTZ,
  check_out_at       TIMESTAMPTZ,
  check_in_lat       DOUBLE PRECISION,
  check_in_lng       DOUBLE PRECISION,
  check_out_lat      DOUBLE PRECISION,
  check_out_lng      DOUBLE PRECISION,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS visits_owner_idx     ON visits(owner_user_id);
CREATE INDEX IF NOT EXISTS visits_territory_idx ON visits(territory_id);
CREATE INDEX IF NOT EXISTS visits_date_idx      ON visits(scheduled_date);
CREATE INDEX IF NOT EXISTS visits_client_idx    ON visits(client_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id              TEXT PRIMARY KEY,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  probability     INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  stage           TEXT NOT NULL CHECK (stage IN (
                    'qualification','proposal','negotiation','won','lost'
                  )),
  expected_close  DATE NOT NULL,
  priority        TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  next_action     TEXT NOT NULL DEFAULT '',
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  territory_id    TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  loss_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS opp_owner_idx     ON opportunities(owner_user_id);
CREATE INDEX IF NOT EXISTS opp_territory_idx ON opportunities(territory_id);
CREATE INDEX IF NOT EXISTS opp_stage_idx     ON opportunities(stage);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  client_id        TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name      TEXT NOT NULL,
  owner_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  territory_id     TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  date             DATE NOT NULL,
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(6,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL CHECK (status IN (
                     'draft','awaiting_approval','confirmed','delivered','cancelled'
                   )),
  approval_status  TEXT NOT NULL CHECK (approval_status IN (
                     'not_required','pending','approved','rejected'
                   )),
  sync_status      TEXT NOT NULL DEFAULT 'not_synced' CHECK (sync_status IN (
                     'not_synced','queued','synced'
                   )),
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_owner_idx     ON orders(owner_user_id);
CREATE INDEX IF NOT EXISTS orders_territory_idx ON orders(territory_id);
CREATE INDEX IF NOT EXISTS orders_status_idx    ON orders(status);
CREATE INDEX IF NOT EXISTS orders_approval_idx  ON orders(approval_status);
CREATE INDEX IF NOT EXISTS orders_date_idx      ON orders(date DESC);

CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  ref          TEXT NOT NULL UNIQUE,
  category     TEXT NOT NULL DEFAULT '',
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  image        TEXT,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_stock_idx ON products(stock);

CREATE TABLE IF NOT EXISTS targets (
  id                  TEXT PRIMARY KEY,
  owner_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_label        TEXT NOT NULL,
  revenue_goal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  visits_goal         INTEGER NOT NULL DEFAULT 0,
  opportunities_goal  INTEGER NOT NULL DEFAULT 0,
  orders_goal         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS targets_owner_idx ON targets(owner_user_id);

CREATE TABLE IF NOT EXISTS integrations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  scope         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('connected','configured','attention')),
  last_sync_at  TIMESTAMPTZ,
  description   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  level       TEXT NOT NULL CHECK (level IN ('info','warning','critical')),
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx        ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id) WHERE read = FALSE;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications  BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_digest        BOOLEAN NOT NULL DEFAULT FALSE,
  auto_sync            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  meta         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx     ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON audit_logs(actor_user_id);

-- Optional FK back from teams.manager_user_id once users exists. Added as deferred FK
-- to avoid bootstrap ordering issues; left as plain TEXT for forward-compat.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'companies','users','clients','visits','opportunities',
    'orders','products','targets'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_set_updated_at ON %I; '
      || 'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

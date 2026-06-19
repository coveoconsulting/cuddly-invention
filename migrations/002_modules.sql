-- 002_modules.sql
-- Adds prospects, activities and documents modules.

CREATE TABLE IF NOT EXISTS prospects (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  contact_name          TEXT NOT NULL DEFAULT '',
  phone                 TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  source                TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                          'new','qualified','contacted','converted','lost'
                        )),
  score                 INTEGER NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  owner_user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  territory_id          TEXT NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  notes                 TEXT NOT NULL DEFAULT '',
  converted_client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  converted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prospects_status_idx    ON prospects(status);
CREATE INDEX IF NOT EXISTS prospects_owner_idx     ON prospects(owner_user_id);
CREATE INDEX IF NOT EXISTS prospects_territory_idx ON prospects(territory_id);

CREATE TABLE IF NOT EXISTS activities (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('call','email','note','task','meeting')),
  subject         TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id       TEXT REFERENCES clients(id) ON DELETE CASCADE,
  opportunity_id  TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
  prospect_id     TEXT REFERENCES prospects(id) ON DELETE CASCADE,
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activities_owner_idx       ON activities(owner_user_id);
CREATE INDEX IF NOT EXISTS activities_client_idx      ON activities(client_id);
CREATE INDEX IF NOT EXISTS activities_opportunity_idx ON activities(opportunity_id);
CREATE INDEX IF NOT EXISTS activities_prospect_idx    ON activities(prospect_id);
CREATE INDEX IF NOT EXISTS activities_due_idx         ON activities(due_date) WHERE due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS documents (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  blob_url               TEXT NOT NULL,
  size_bytes             BIGINT NOT NULL DEFAULT 0,
  content_type           TEXT NOT NULL DEFAULT '',
  uploaded_by_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id              TEXT REFERENCES clients(id) ON DELETE CASCADE,
  order_id               TEXT REFERENCES orders(id) ON DELETE CASCADE,
  opportunity_id         TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
  signed_at              TIMESTAMPTZ,
  signed_by_name         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_client_idx      ON documents(client_id);
CREATE INDEX IF NOT EXISTS documents_order_idx       ON documents(order_id);
CREATE INDEX IF NOT EXISTS documents_opportunity_idx ON documents(opportunity_id);

DROP TRIGGER IF EXISTS prospects_set_updated_at ON prospects;
CREATE TRIGGER prospects_set_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

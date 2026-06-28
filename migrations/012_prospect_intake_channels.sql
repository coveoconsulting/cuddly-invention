-- 012_prospect_intake_channels.sql
-- Field-prospecting intake. This product is the field sales (terrain) app — the call
-- center is a separate application. We add first-class typed columns (not a JSON blob)
-- so the funnel stays reportable and filterable.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS address            TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS zone               TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS establishment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS potential          TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS competitor         TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_visit_at      DATE;

ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_potential_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_potential_check
  CHECK (potential IS NULL OR potential IN ('low','medium','high'));

-- Field route planning: "outlets to (re)visit".
CREATE INDEX IF NOT EXISTS prospects_next_visit_idx
  ON prospects(next_visit_at) WHERE next_visit_at IS NOT NULL;

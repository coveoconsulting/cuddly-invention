-- 011_prospect_team_source.sql
-- Enriches the prospecting intake:
--   * team        : which force created/owns the lead — call_center (téléphonie) or field (terrain).
--   * lead_source : structured channel the lead came from — societe / appel / rdv / mail / rs.
--   * need        : qualified need detected during qualification.
--   * solution_fit: how our offer matches that need (adequation).
-- The legacy free-text `source` column is kept for optional extra detail (e.g. "Salon X").

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'field';
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_team_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_team_check
  CHECK (team IN ('call_center','field'));

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'societe';
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_lead_source_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_lead_source_check
  CHECK (lead_source IN ('societe','appel','rdv','mail','rs'));

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS need TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS solution_fit TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS prospects_team_idx ON prospects(team);

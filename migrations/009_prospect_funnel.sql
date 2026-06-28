-- 009_prospect_funnel.sql
-- Aligns the prospect funnel with the real B2B sales cycle:
-- new -> contacted -> qualified -> quoted (devis envoyé) -> negotiation -> converted (gagné) / lost.
-- Adds the missing "quoted" and "negotiation" stages used to gate quote/conversion logic.

ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;

ALTER TABLE prospects ADD CONSTRAINT prospects_status_check
  CHECK (status IN ('new','contacted','qualified','quoted','negotiation','converted','lost'));

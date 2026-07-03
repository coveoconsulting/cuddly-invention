-- 013_phase0_foundations.sql
-- Phase 0 — foundations for the enriched Morocco field-sales platform.
-- Compliance (compliance_ma): first-class legal identifiers on the account so they can
-- be printed on quotes / delivery notes / invoices and reported on, rather than buried
-- in free-text notes. Typed columns keep the funnel reportable. Subsequent modules
-- (stock, delivery, payments) ship as their own migrations 014+.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS ice            TEXT NOT NULL DEFAULT ''; -- Identifiant Commun de l'Entreprise
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id         TEXT NOT NULL DEFAULT ''; -- IF — Identifiant Fiscal
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rc             TEXT NOT NULL DEFAULT ''; -- Registre du Commerce
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fiscal_address TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fiscal_city    TEXT NOT NULL DEFAULT '';

-- ICE is unique per company in Morocco; index for lookup/dedup without enforcing a hard
-- UNIQUE (legacy rows may share the empty default).
CREATE INDEX IF NOT EXISTS clients_ice_idx ON clients(ice) WHERE ice <> '';

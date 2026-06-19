-- 007_subscription_plan.sql
-- Subscription tier on the company: gates WhatsApp, Quotes, AI Assistant, etc.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'essentiel',
  ADD COLUMN IF NOT EXISTS plan_seats        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS plan_notes        TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_plan_check
      CHECK (plan IN ('essentiel','professionnel','enterprise','sur_mesure'));
  END IF;
END $$;

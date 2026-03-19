-- ============================================================================
-- Correction 5: date_end for chantier interventions (multi-day)
-- ============================================================================

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS date_end TIMESTAMPTZ;

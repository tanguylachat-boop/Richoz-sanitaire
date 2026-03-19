-- ============================================================================
-- Correction 3: Keys info column on interventions
-- ============================================================================

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS keys_info TEXT;

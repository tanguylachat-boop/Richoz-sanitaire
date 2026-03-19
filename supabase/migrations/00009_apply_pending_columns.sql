-- ============================================================================
-- Apply pending columns that may not have been migrated yet.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run this in Supabase SQL Editor to fix schema cache errors.
-- ============================================================================

-- Correction 3: Clés & Accès (from 00006)
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS keys_info TEXT;

-- Correction 5: Chantier date range (from 00007)
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS date_end TIMESTAMPTZ;

-- Correction 1: Technician type preference (from prd-v2-migrations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS intervention_type_preference TEXT
  CHECK (intervention_type_preference IN ('depannage', 'chantier'));

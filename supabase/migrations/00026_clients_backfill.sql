-- ============================================================================
-- Migration 00018b — Backfill clients from interventions.client_info
-- ============================================================================
-- Idempotent: only interventions where client_id IS NULL and client_info is not
-- empty are processed. Uses match_or_create_client() to avoid duplicates.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_client_id UUID;
  v_name TEXT;
  v_phone TEXT;
  v_email TEXT;
BEGIN
  FOR r IN
    SELECT id, address, regie_id, client_info
    FROM interventions
    WHERE client_id IS NULL
      AND client_info IS NOT NULL
      AND client_info::text <> '{}'
  LOOP
    v_name := COALESCE(r.client_info->>'name', NULL);
    v_phone := COALESCE(r.client_info->>'phone', NULL);
    v_email := COALESCE(r.client_info->>'email', NULL);

    -- Skip if no identifying info at all
    IF v_name IS NULL AND v_phone IS NULL THEN
      CONTINUE;
    END IF;

    v_client_id := match_or_create_client(
      v_phone,
      v_name,
      r.address,
      v_email,
      r.regie_id,
      'locataire'
    );

    UPDATE interventions SET client_id = v_client_id WHERE id = r.id;
  END LOOP;
END $$;

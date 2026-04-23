-- ============================================================================
-- Migration 00017 — Leave types (congé / maladie / ...) + RH stats
-- ============================================================================
-- Adds a leave_type column to leave_requests so we can distinguish vacation,
-- sick leave, RTT, accidents, etc. Backfills existing rows based on `reason`.
-- ============================================================================

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_type TEXT
    CHECK (leave_type IN ('conge', 'maladie', 'rtt', 'sans_solde', 'accident', 'autre'))
    DEFAULT 'conge';

-- Backfill existing rows using keywords in `reason`
UPDATE leave_requests
  SET leave_type = 'maladie'
  WHERE leave_type IS NULL AND reason ILIKE '%maladie%';

UPDATE leave_requests
  SET leave_type = 'accident'
  WHERE leave_type IS NULL AND reason ILIKE '%accident%';

UPDATE leave_requests
  SET leave_type = 'rtt'
  WHERE leave_type IS NULL AND reason ILIKE '%rtt%';

UPDATE leave_requests
  SET leave_type = 'sans_solde'
  WHERE leave_type IS NULL AND (reason ILIKE '%sans solde%' OR reason ILIKE '%non paye%' OR reason ILIKE '%non payé%');

-- Anything still unset defaults to 'conge'
UPDATE leave_requests
  SET leave_type = 'conge'
  WHERE leave_type IS NULL;

-- Ensure NOT NULL going forward
ALTER TABLE leave_requests
  ALTER COLUMN leave_type SET NOT NULL;

-- Indexes for stats page queries
CREATE INDEX IF NOT EXISTS idx_leave_requests_type ON leave_requests(leave_type);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tech_year ON leave_requests(technician_id, start_date);

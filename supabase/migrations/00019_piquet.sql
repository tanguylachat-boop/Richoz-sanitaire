-- ============================================================================
-- Migration 00019 — Service de piquet (on-call)
-- ============================================================================
-- Adds tables for on-call scheduling and night intervention reports.
-- The dispatch itself happens via operator-level phone forwarding (out of scope).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Weekly on-call planning
CREATE TABLE IF NOT EXISTS piquet_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT piquet_date_order CHECK (end_date >= start_date),
  -- Prevent overlapping shifts between two technicians
  CONSTRAINT piquet_no_overlap EXCLUDE USING gist (
    daterange(start_date, end_date, '[]') WITH &&
  )
);

-- Mark interventions as piquet (night/urgent) with rate multiplier
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS is_piquet BOOLEAN DEFAULT false;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS night_rate_multiplier NUMERIC(3,2) DEFAULT 1.00;

-- Simplified night report (mobile-first, one-screen form)
CREATE TABLE IF NOT EXISTS piquet_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE SET NULL,
  technician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  call_received_at TIMESTAMPTZ NOT NULL,
  intervention_started_at TIMESTAMPTZ,
  intervention_ended_at TIMESTAMPTZ,
  client_name TEXT,
  client_phone TEXT,
  address TEXT NOT NULL,
  problem_description TEXT,
  actions_taken TEXT,
  supplies_used TEXT,
  photos TEXT[] DEFAULT '{}',
  client_signature TEXT,
  travel_distance_km NUMERIC(5,1),
  is_billable BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','validated','billed')),
  invoice_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_piquet_schedule_dates ON piquet_schedule(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_piquet_schedule_tech ON piquet_schedule(technician_id);
CREATE INDEX IF NOT EXISTS idx_piquet_reports_tech ON piquet_reports(technician_id);
CREATE INDEX IF NOT EXISTS idx_piquet_reports_status ON piquet_reports(status);
CREATE INDEX IF NOT EXISTS idx_piquet_reports_created ON piquet_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_piquet ON interventions(is_piquet) WHERE is_piquet = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_piquet_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS piquet_reports_updated_at ON piquet_reports;
CREATE TRIGGER piquet_reports_updated_at BEFORE UPDATE ON piquet_reports
  FOR EACH ROW EXECUTE FUNCTION set_piquet_reports_updated_at();

-- RLS
ALTER TABLE piquet_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE piquet_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "piquet_schedule_all" ON piquet_schedule;
CREATE POLICY "piquet_schedule_all" ON piquet_schedule FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "piquet_reports_all" ON piquet_reports;
CREATE POLICY "piquet_reports_all" ON piquet_reports FOR ALL USING (true) WITH CHECK (true);

-- Helper view: technician currently on call (security_invoker to respect caller's RLS)
DROP VIEW IF EXISTS piquet_current;
CREATE VIEW piquet_current WITH (security_invoker=true) AS
SELECT ps.*, u.first_name, u.last_name, u.phone AS technician_phone
FROM piquet_schedule ps
JOIN users u ON u.id = ps.technician_id
WHERE CURRENT_DATE BETWEEN ps.start_date AND ps.end_date;

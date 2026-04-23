-- ============================================================================
-- Migration 00020 — Maintenance contracts (entretien récurrent)
-- ============================================================================
-- Contracts that auto-generate scheduled interventions (annuel, semestriel, ...).
-- Billing happens after intervention validation (manual, not auto).
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  regie_id UUID REFERENCES regies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  equipment TEXT,
  address TEXT,
  frequency TEXT NOT NULL
    CHECK (frequency IN ('annuel','biannuel','trimestriel','mensuel','custom')),
  custom_interval_days INTEGER,
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_performed_date DATE,
  amount_per_visit NUMERIC(10,2) NOT NULL DEFAULT 0,
  estimated_duration_minutes INTEGER DEFAULT 60,
  auto_generate_intervention BOOLEAN DEFAULT true,
  reminder_days_before INTEGER DEFAULT 14,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active','paused','terminated','expired')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contract_client_or_regie CHECK (
    (client_id IS NOT NULL) OR (regie_id IS NOT NULL)
  )
);

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS maintenance_contract_id UUID
  REFERENCES maintenance_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_next_due ON maintenance_contracts(next_due_date) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_contracts_client ON maintenance_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_regie ON maintenance_contracts(regie_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON maintenance_contracts(status);
CREATE INDEX IF NOT EXISTS idx_interventions_contract ON interventions(maintenance_contract_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_updated_at ON maintenance_contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON maintenance_contracts
  FOR EACH ROW EXECUTE FUNCTION set_contracts_updated_at();

-- Auto-generate contract_number from year + sequence
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  next_seq INTEGER;
BEGIN
  IF NEW.contract_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  year_prefix := 'CM-' || TO_CHAR(NOW(), 'YYYY') || '-';
  SELECT COALESCE(MAX(CAST(SPLIT_PART(contract_number, '-', 3) AS INTEGER)), 0) + 1
    INTO next_seq
    FROM maintenance_contracts
    WHERE contract_number LIKE year_prefix || '%';
  NEW.contract_number := year_prefix || LPAD(next_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_set_number ON maintenance_contracts;
CREATE TRIGGER contracts_set_number BEFORE INSERT ON maintenance_contracts
  FOR EACH ROW EXECUTE FUNCTION generate_contract_number();

-- RLS
ALTER TABLE maintenance_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contracts_all" ON maintenance_contracts;
CREATE POLICY "contracts_all" ON maintenance_contracts FOR ALL USING (true) WITH CHECK (true);

-- Helper function to compute the next due date from a given base date
CREATE OR REPLACE FUNCTION contract_next_due(base_date DATE, freq TEXT, custom_days INTEGER)
RETURNS DATE AS $$
BEGIN
  RETURN CASE freq
    WHEN 'annuel' THEN base_date + INTERVAL '1 year'
    WHEN 'biannuel' THEN base_date + INTERVAL '6 months'
    WHEN 'trimestriel' THEN base_date + INTERVAL '3 months'
    WHEN 'mensuel' THEN base_date + INTERVAL '1 month'
    WHEN 'custom' THEN base_date + (custom_days || ' days')::INTERVAL
    ELSE base_date + INTERVAL '1 year'
  END::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- RPC for n8n scheduler: find contracts due in the next N days that haven't been
-- generated yet, create an intervention, then advance next_due_date.
CREATE OR REPLACE FUNCTION process_due_maintenance_contracts(
  p_lookahead_days INTEGER DEFAULT 14
)
RETURNS TABLE (contract_id UUID, intervention_id UUID) AS $$
DECLARE
  c RECORD;
  v_iv_id UUID;
BEGIN
  FOR c IN
    SELECT mc.*
    FROM maintenance_contracts mc
    WHERE mc.status = 'active'
      AND mc.auto_generate_intervention = true
      AND mc.next_due_date - COALESCE(mc.reminder_days_before, 14) <= (CURRENT_DATE + p_lookahead_days)
      AND NOT EXISTS (
        SELECT 1 FROM interventions i
        WHERE i.maintenance_contract_id = mc.id
          AND i.status NOT IN ('termine', 'billed', 'ready_to_bill', 'annule')
      )
      AND (mc.end_date IS NULL OR mc.end_date >= CURRENT_DATE)
  LOOP
    INSERT INTO interventions (
      title,
      description,
      address,
      date_planned,
      estimated_duration_minutes,
      status,
      priority,
      regie_id,
      client_id,
      source_type,
      intervention_type,
      maintenance_contract_id,
      client_info
    ) VALUES (
      c.title,
      COALESCE(c.description, ''),
      COALESCE(c.address, ''),
      (c.next_due_date)::TIMESTAMPTZ + INTERVAL '9 hours',
      COALESCE(c.estimated_duration_minutes, 60),
      'nouveau',
      0,
      c.regie_id,
      c.client_id,
      'maintenance_contract',
      'depannage',
      c.id,
      NULL
    )
    RETURNING id INTO v_iv_id;

    contract_id := c.id;
    intervention_id := v_iv_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Migration 00018 — Clients (CRM)
-- ============================================================================
-- Creates a normalized `clients` table so we can track history per person
-- (tenant/owner/private/company). Links interventions via client_id (nullable
-- for backward compatibility; client_info JSONB is kept as legacy).
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_type TEXT NOT NULL DEFAULT 'locataire'
    CHECK (client_type IN ('locataire', 'proprietaire', 'particulier', 'entreprise')),
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  address TEXT,
  apartment TEXT,
  city TEXT,
  postal_code TEXT,
  regie_id UUID REFERENCES regies(id) ON DELETE SET NULL,
  owner_name TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT clients_identity_check CHECK (
    (last_name IS NOT NULL) OR (company_name IS NOT NULL)
  )
);

-- Link interventions to a client (nullable for compat)
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Indexes for search
CREATE INDEX IF NOT EXISTS idx_clients_last_name ON clients(last_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_address ON clients(address);
CREATE INDEX IF NOT EXISTS idx_clients_regie ON clients(regie_id);
CREATE INDEX IF NOT EXISTS idx_interventions_client ON interventions(client_id);

-- Trigram indexes for fuzzy search (phone/address/name)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING gin (
  (COALESCE(last_name, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(company_name, '')) gin_trgm_ops
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_clients_updated_at();

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_all" ON clients;
CREATE POLICY "clients_all" ON clients FOR ALL USING (true) WITH CHECK (true);

-- RPC helper for n8n / app: match by normalized phone/address or create
CREATE OR REPLACE FUNCTION match_or_create_client(
  p_phone TEXT,
  p_name TEXT,
  p_address TEXT,
  p_email TEXT DEFAULT NULL,
  p_regie_id UUID DEFAULT NULL,
  p_client_type TEXT DEFAULT 'locataire'
)
RETURNS UUID AS $$
DECLARE
  v_phone_norm TEXT;
  v_matched UUID;
  v_first TEXT;
  v_last TEXT;
  v_space INTEGER;
BEGIN
  -- Normalize phone: strip spaces, +, dashes
  v_phone_norm := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  -- Try match by phone (normalized) — must not be empty
  IF length(v_phone_norm) >= 7 THEN
    SELECT id INTO v_matched
    FROM clients
    WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_norm
       OR regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') = v_phone_norm
    LIMIT 1;
    IF v_matched IS NOT NULL THEN RETURN v_matched; END IF;
  END IF;

  -- Try match by (normalized name + address)
  IF p_name IS NOT NULL AND p_address IS NOT NULL THEN
    SELECT id INTO v_matched
    FROM clients
    WHERE lower(COALESCE(last_name, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(company_name, '')) ILIKE '%' || lower(p_name) || '%'
      AND lower(COALESCE(address, '')) = lower(p_address)
    LIMIT 1;
    IF v_matched IS NOT NULL THEN RETURN v_matched; END IF;
  END IF;

  -- Create a new client
  -- Split name roughly on first space
  IF p_name IS NOT NULL THEN
    v_space := position(' ' in trim(p_name));
    IF v_space > 0 THEN
      v_first := trim(substring(p_name from 1 for v_space - 1));
      v_last := trim(substring(p_name from v_space + 1));
    ELSE
      v_last := trim(p_name);
    END IF;
  END IF;

  INSERT INTO clients (
    client_type, first_name, last_name, phone, email, address, regie_id
  ) VALUES (
    p_client_type,
    v_first,
    COALESCE(v_last, 'Inconnu'),
    p_phone,
    p_email,
    p_address,
    p_regie_id
  ) RETURNING id INTO v_matched;

  RETURN v_matched;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

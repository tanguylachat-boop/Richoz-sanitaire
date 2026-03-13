-- ============================================================================
-- PRD RICHOZ V2 — Database Migrations
-- Generated: 2026-03-13
--
-- IMPORTANT: Run these in order. Each section is idempotent (IF NOT EXISTS).
-- Table name corrections vs PRD:
--   - PRD says "emails" but actual table is "email_inbox"
--   - PRD says "regies.email" but actual column is "regies.email_contact" (already exists)
-- ============================================================================

-- ─── MODULE 1: INBOX ─────────────────────────────────────────────────────────

-- Add is_read flag to email_inbox (for unread count badge)
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

-- extracted_data already exists on email_inbox (JSONB)

-- ─── MODULE 2: CONFIRMATION EMAILS ───────────────────────────────────────────

-- regies.email_contact already exists — no need to add regies.email
-- Add opt-out flag for automatic confirmation emails
ALTER TABLE regies ADD COLUMN IF NOT EXISTS receive_confirmations BOOLEAN DEFAULT true;

-- ─── MODULE 4: RAPPORTS ──────────────────────────────────────────────────────

-- Store generated .docx URL for reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS docx_url TEXT;

-- ─── MODULE 5: CHANTIER (Construction Site) ──────────────────────────────────

-- Chantier details linked to an intervention of type 'chantier'
CREATE TABLE IF NOT EXISTS chantier_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  architect_name TEXT,
  architect_phone TEXT,
  architect_email TEXT,
  site_manager_name TEXT,
  site_manager_phone TEXT,
  keys_location TEXT,
  access_notes TEXT,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chantier_details_intervention_unique UNIQUE (intervention_id)
);

-- Journal de chantier (message feed)
CREATE TABLE IF NOT EXISTS chantier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Avis de coupure (water/electricity/gas outage notices)
CREATE TABLE IF NOT EXISTS chantier_cutoff_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  cutoff_type TEXT NOT NULL CHECK (cutoff_type IN ('eau', 'electricite', 'gaz')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date_estimated TIMESTAMPTZ,
  floors_affected TEXT,
  message TEXT,
  notice_pdf_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_inbox_is_read ON email_inbox(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_chantier_details_intervention ON chantier_details(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_messages_intervention ON chantier_messages(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_messages_created ON chantier_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chantier_cutoff_intervention ON chantier_cutoff_notices(intervention_id);

-- ─── RLS POLICIES (basic — adjust to your auth model) ────────────────────────

ALTER TABLE chantier_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_cutoff_notices ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write chantier data
CREATE POLICY IF NOT EXISTS "chantier_details_all" ON chantier_details
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "chantier_messages_all" ON chantier_messages
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "chantier_cutoff_notices_all" ON chantier_cutoff_notices
  FOR ALL USING (true) WITH CHECK (true);

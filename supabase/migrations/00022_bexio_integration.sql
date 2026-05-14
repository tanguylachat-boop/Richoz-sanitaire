-- Bexio integration : extend invoices to mirror Bexio's kb_invoice state.
-- The dashboard becomes the operational view; Bexio remains the system of
-- record for the actual document. We sync read-only via cron + write when
-- the admin creates an invoice from a validated report.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS bexio_id INTEGER UNIQUE,
  ADD COLUMN IF NOT EXISTS bexio_contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS kb_item_status_id INTEGER,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS bexio_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_bexio_id ON invoices(bexio_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

-- Some Bexio invoices won't map to a Supabase report (manual invoices in Bexio).
-- Relax the NOT NULL so the cron can ingest them.
ALTER TABLE invoices ALTER COLUMN report_id DROP NOT NULL;

-- Track Bexio contact id on regies so we don't recreate contacts each time.
ALTER TABLE regies
  ADD COLUMN IF NOT EXISTS bexio_contact_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_regies_bexio_contact ON regies(bexio_contact_id);

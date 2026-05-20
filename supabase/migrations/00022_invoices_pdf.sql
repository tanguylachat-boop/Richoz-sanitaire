-- Store the Bexio invoice PDF URL after creation, so the admin can preview
-- the PDF directly in the dashboard without opening Bexio.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url text;
COMMENT ON COLUMN invoices.pdf_url IS 'Public Supabase Storage URL of the Bexio invoice PDF, fetched and uploaded after creation';

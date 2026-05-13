-- Add docx_url tracking for edited Word documents on reports
-- and add pdf_url / docx_url on piquet_reports so admins can replace
-- the auto-generated PDF with the converted edited Word version.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS docx_url TEXT;

ALTER TABLE piquet_reports
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS docx_url TEXT;

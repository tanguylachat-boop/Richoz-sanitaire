-- =====================================================
-- Migration: Add work_order_number to interventions AND email_inbox
-- Numéro de bon de travail (référence régie)
-- =====================================================

-- 1. Add column to interventions table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'interventions' AND column_name = 'work_order_number'
    ) THEN
        ALTER TABLE interventions ADD COLUMN work_order_number TEXT;
    END IF;
END $$;

COMMENT ON COLUMN interventions.work_order_number IS 'Numéro de bon de travail / Référence régie';

-- 2. Add column to email_inbox table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_inbox' AND column_name = 'work_order_number'
    ) THEN
        ALTER TABLE email_inbox ADD COLUMN work_order_number TEXT;
    END IF;
END $$;

COMMENT ON COLUMN email_inbox.work_order_number IS 'Numéro de bon de travail extrait de l''email';

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_interventions_work_order_number ON interventions(work_order_number);
CREATE INDEX IF NOT EXISTS idx_email_inbox_work_order_number ON email_inbox(work_order_number);
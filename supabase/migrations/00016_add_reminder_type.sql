-- ============================================================================
-- Add reminder_type column to intervention_reminders
-- Used to differentiate cutoff notices from regular reminders
-- ============================================================================

ALTER TABLE intervention_reminders
  ADD COLUMN IF NOT EXISTS reminder_type TEXT DEFAULT 'reminder';

COMMENT ON COLUMN intervention_reminders.reminder_type IS 'Type: reminder (default) or cutoff (avis de coupure)';

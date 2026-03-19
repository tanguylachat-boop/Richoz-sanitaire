-- ============================================================================
-- Correction 7: Intervention reminders (rappels sur agenda technicien)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intervention_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  message TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON intervention_reminders(user_id, reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_intervention ON intervention_reminders(intervention_id);

ALTER TABLE intervention_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "intervention_reminders_all" ON intervention_reminders
  FOR ALL USING (true) WITH CHECK (true);

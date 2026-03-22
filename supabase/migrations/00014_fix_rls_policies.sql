-- =============================================================================
-- FIX RLS POLICIES FOR PRODUCTION
-- Replaces dangerous USING(true) policies with proper access controls
-- =============================================================================

-- ─── chantier_details ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chantier_details_all" ON chantier_details;

CREATE POLICY "chantier_details_select" ON chantier_details
  FOR SELECT USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_details_insert" ON chantier_details
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_details_update" ON chantier_details
  FOR UPDATE USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_details_delete" ON chantier_details
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

-- ─── chantier_messages ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chantier_messages_all" ON chantier_messages;

CREATE POLICY "chantier_messages_select" ON chantier_messages
  FOR SELECT USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_messages_insert" ON chantier_messages
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_messages_update" ON chantier_messages
  FOR UPDATE USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_messages_delete" ON chantier_messages
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

-- ─── chantier_cutoff_notices ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "chantier_cutoff_notices_all" ON chantier_cutoff_notices;

CREATE POLICY "chantier_cutoff_notices_select" ON chantier_cutoff_notices
  FOR SELECT USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_cutoff_notices_insert" ON chantier_cutoff_notices
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_cutoff_notices_update" ON chantier_cutoff_notices
  FOR UPDATE USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_cutoff_notices_delete" ON chantier_cutoff_notices
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

-- ─── chantier_photos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chantier_photos_all" ON chantier_photos;

CREATE POLICY "chantier_photos_select" ON chantier_photos
  FOR SELECT USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_photos_insert" ON chantier_photos
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_photos_update" ON chantier_photos
  FOR UPDATE USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "chantier_photos_delete" ON chantier_photos
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

-- ─── notifications ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_all" ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE USING (recipient_id = auth.uid());

-- ─── intervention_reminders ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "intervention_reminders_all" ON intervention_reminders;

CREATE POLICY "intervention_reminders_select" ON intervention_reminders
  FOR SELECT USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "intervention_reminders_insert" ON intervention_reminders
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "intervention_reminders_update" ON intervention_reminders
  FOR UPDATE USING (
    auth.uid() IN (SELECT technician_id FROM interventions WHERE id = intervention_id)
    OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "intervention_reminders_delete" ON intervention_reminders
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

-- ─── company_settings (S6 - RLS was not enabled) ────────────────────────────
ALTER TABLE IF EXISTS company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select" ON company_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "company_settings_update" ON company_settings
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "company_settings_insert" ON company_settings
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'secretary'))
  );

CREATE POLICY "company_settings_delete" ON company_settings
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
  );

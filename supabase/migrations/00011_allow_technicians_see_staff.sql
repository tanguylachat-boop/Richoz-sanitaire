-- ============================================================================
-- Allow technicians to see admin/secretary user IDs
-- Required for notification inserts (technician → admin)
-- ============================================================================

-- Technicians need to know admin/secretary IDs to send them notifications.
-- Current RLS only allows users_select_own (see own row) and users_select_admin
-- (admins see all). This policy lets any authenticated user see staff rows.
CREATE POLICY "users_select_staff" ON users
    FOR SELECT USING (role IN ('admin', 'secretary'));

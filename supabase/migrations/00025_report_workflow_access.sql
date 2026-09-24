-- Permit correction/resubmission, with both state and column-level enforcement.
BEGIN;
CREATE FUNCTION public.enforce_report_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor public.users%ROWTYPE;
BEGIN
 IF auth.role() = 'service_role' OR auth.role() IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO actor FROM public.users WHERE id = auth.uid();
 IF actor.id IS NULL OR actor.is_active IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Inactive or missing report actor' USING ERRCODE='42501';
 END IF;
 IF actor.role IN ('admin','secretary') THEN
   IF (TG_OP='INSERT' OR NEW.validated_by IS DISTINCT FROM OLD.validated_by)
      AND NEW.validated_by IS NOT NULL AND NEW.validated_by <> actor.id THEN
     RAISE EXCEPTION 'Cannot impersonate a validator' USING ERRCODE='42501';
   END IF;
   IF NEW.status='validated' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'validated') THEN
     NEW.validated_by := actor.id; NEW.validated_at := now(); NEW.revision_requested := false;
   END IF;
   IF NEW.status='rejected' AND (NEW.revision_requested IS DISTINCT FROM true OR nullif(btrim(NEW.revision_message),'') IS NULL) THEN
     RAISE EXCEPTION 'A returned report requires feedback' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF actor.role <> 'technician' OR NEW.technician_id <> actor.id OR NOT EXISTS (
   SELECT 1 FROM public.interventions WHERE id=NEW.intervention_id AND technician_id=actor.id
 ) THEN RAISE EXCEPTION 'Report assignment denied' USING ERRCODE='42501'; END IF;
 IF NEW.status IS NULL OR NEW.status NOT IN ('draft','submitted') THEN
   RAISE EXCEPTION 'Technician transition denied' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.validated_by IS NOT NULL OR NEW.validated_at IS NOT NULL OR NEW.revision_message IS NOT NULL
      OR NEW.revision_requested IS DISTINCT FROM false OR NEW.docx_url IS NOT NULL OR NEW.pdf_url IS NOT NULL THEN
     RAISE EXCEPTION 'Reserved report fields' USING ERRCODE='42501';
   END IF;
 ELSE
   IF OLD.technician_id <> actor.id OR OLD.status IS NULL OR OLD.status NOT IN ('draft','rejected') THEN
     RAISE EXCEPTION 'This report cannot be edited' USING ERRCODE='42501';
   END IF;
   -- Only these existing technician fields may change. All present/future others are protected.
   IF (to_jsonb(NEW) - ARRAY['text_content','vocal_url','vocal_transcription','photos','checklist',
      'is_billable','billable_reason','work_duration_minutes','materials_used','supplies_text',
      'client_signature','is_completed','status','revision_requested','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['text_content','vocal_url','vocal_transcription','photos','checklist',
      'is_billable','billable_reason','work_duration_minutes','materials_used','supplies_text',
      'client_signature','is_completed','status','revision_requested','updated_at']) THEN
     RAISE EXCEPTION 'Reserved report fields are immutable' USING ERRCODE='42501';
   END IF;
   IF NEW.status='draft' AND NEW.revision_requested IS DISTINCT FROM OLD.revision_requested THEN
     RAISE EXCEPTION 'Feedback is resolved only by resubmission' USING ERRCODE='42501';
   END IF;
 END IF;
 IF NEW.status='submitted' THEN
   IF NEW.revision_requested IS DISTINCT FROM false THEN
     RAISE EXCEPTION 'Submission must resolve the revision request' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_report_workflow() FROM PUBLIC;
CREATE TRIGGER report_workflow_guard BEFORE INSERT OR UPDATE ON public.reports
 FOR EACH ROW EXECUTE FUNCTION public.enforce_report_workflow();

DROP POLICY reports_insert_own ON public.reports;
DROP POLICY reports_update_own_draft ON public.reports;
CREATE POLICY reports_insert_assigned ON public.reports FOR INSERT TO authenticated
 WITH CHECK (technician_id=auth.uid() AND status IN ('draft','submitted') AND EXISTS (
 SELECT 1 FROM public.interventions i WHERE i.id=intervention_id AND i.technician_id=auth.uid()));
CREATE POLICY reports_update_correctable ON public.reports FOR UPDATE TO authenticated
 USING (technician_id=auth.uid() AND status IN ('draft','rejected'))
 WITH CHECK (technician_id=auth.uid() AND status IN ('draft','submitted') AND EXISTS (
 SELECT 1 FROM public.interventions i WHERE i.id=intervention_id AND i.technician_id=auth.uid()));
CREATE POLICY reports_active_actor ON public.reports AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true))
 WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true));

-- Keep legacy and current notification recipients consistent, without trusting the sender field.
UPDATE public.notifications SET recipient_id=user_id WHERE recipient_id IS NULL;
ALTER TABLE public.notifications ALTER COLUMN recipient_id SET NOT NULL;
CREATE FUNCTION public.enforce_notification_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.recipient_id:=coalesce(NEW.recipient_id,NEW.user_id);
   NEW.user_id:=coalesce(NEW.user_id,NEW.recipient_id);
   IF NEW.user_id IS DISTINCT FROM NEW.recipient_id THEN RAISE EXCEPTION 'Conflicting recipient' USING ERRCODE='23514'; END IF;
   IF auth.role()='authenticated' THEN NEW.sender_id:=auth.uid(); END IF;
 ELSIF auth.role()='authenticated' THEN
   IF (to_jsonb(NEW)-'is_read') IS DISTINCT FROM (to_jsonb(OLD)-'is_read') THEN
     RAISE EXCEPTION 'Only read state may change' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_notification_recipient() FROM PUBLIC;
CREATE TRIGGER notification_recipient_guard BEFORE INSERT OR UPDATE ON public.notifications
 FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_recipient();
DROP POLICY notifications_select ON public.notifications;
DROP POLICY notifications_insert ON public.notifications;
DROP POLICY notifications_update ON public.notifications;
DROP POLICY notifications_delete ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications FOR SELECT TO authenticated
 USING (recipient_id=auth.uid());
CREATE POLICY notifications_own_mark ON public.notifications FOR UPDATE TO authenticated
 USING (recipient_id=auth.uid()) WITH CHECK (recipient_id=auth.uid());
CREATE POLICY notifications_staff_insert ON public.notifications FOR INSERT TO authenticated
 WITH CHECK (public.is_admin_or_secretary());
CREATE POLICY notifications_active_actor ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true))
 WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true));
COMMIT;

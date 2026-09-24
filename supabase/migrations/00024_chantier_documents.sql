-- LOT 2A. NOT APPLIED. Single-company schema: no tenant/company membership exists.
-- The object path is the attachment: intervention UUID / upload UUID--safe name.pdf.
-- No separate metadata row, so Storage upload atomically establishes the attachment.
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chantier-documents', 'chantier-documents', false, 20971520, ARRAY['application/pdf']);

CREATE FUNCTION public.can_access_chantier_document(object_name text, managing boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.interventions i JOIN public.users u ON u.id = auth.uid()
   WHERE i.id::text = split_part(object_name, '/', 1)
     AND i.intervention_type = 'chantier' AND u.is_active = true
     AND (u.role IN ('admin', 'secretary') OR (NOT managing AND i.technician_id = u.id))
     AND object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}--[a-zA-Z0-9._ -]+\.pdf$'
 );
$$;
REVOKE ALL ON FUNCTION public.can_access_chantier_document(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chantier_document(text, boolean) TO authenticated;
CREATE POLICY chantier_documents_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, false));
CREATE POLICY chantier_documents_add ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, true));
CREATE POLICY chantier_documents_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, true));
-- No UPDATE policy: immutable objects, idempotent retry without overwriting a PDF.
COMMIT;

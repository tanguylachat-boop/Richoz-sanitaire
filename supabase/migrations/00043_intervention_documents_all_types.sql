-- PDF attachments for every intervention (chantier AND dépannage).
-- 00024 was never applied in prod: this migration is idempotent so it runs on
-- a database that has 00024 (local) as well as one that never had it (prod).
-- Bucket id kept as 'chantier-documents' (existing code, tests and local data).
-- Path stays: intervention UUID / upload UUID--safe name.pdf.
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chantier-documents', 'chantier-documents', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];

-- Same rule as 00024 minus the chantier-only restriction:
-- staff (admin/secretary) read+manage, assigned technician read only.
CREATE OR REPLACE FUNCTION public.can_access_chantier_document(object_name text, managing boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.interventions i JOIN public.users u ON u.id = auth.uid()
   WHERE i.id::text = split_part(object_name, '/', 1)
     AND u.is_active = true
     AND (u.role IN ('admin', 'secretary') OR (NOT managing AND i.technician_id = u.id))
     AND object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}--[a-zA-Z0-9._ -]+\.pdf$'
 );
$$;
REVOKE ALL ON FUNCTION public.can_access_chantier_document(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chantier_document(text, boolean) TO authenticated;

DROP POLICY IF EXISTS chantier_documents_read ON storage.objects;
CREATE POLICY chantier_documents_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, false));
DROP POLICY IF EXISTS chantier_documents_add ON storage.objects;
CREATE POLICY chantier_documents_add ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, true));
DROP POLICY IF EXISTS chantier_documents_delete ON storage.objects;
CREATE POLICY chantier_documents_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chantier-documents' AND public.can_access_chantier_document(name, true));
-- No UPDATE policy: immutable objects, idempotent retry without overwriting a PDF.
COMMIT;

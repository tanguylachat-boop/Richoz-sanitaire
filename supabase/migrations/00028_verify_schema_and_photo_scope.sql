-- Reject incompatible pre-existing objects instead of trusting IF NOT EXISTS.
BEGIN;
CREATE TEMP TABLE expected_chantier_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL ,
  architect_name TEXT,
  architect_phone TEXT,
  architect_email TEXT,
  site_manager_name TEXT,
  site_manager_phone TEXT,
  keys_location TEXT,
  access_notes TEXT,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chantier_details_intervention_unique UNIQUE (intervention_id)
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.chantier_details'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_chantier_details'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible chantier_details.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_chantier_details'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.chantier_details'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on chantier_details';
 END IF;
END $$;
CREATE TEMP TABLE expected_chantier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL ,
  author_id UUID ,
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.chantier_messages'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_chantier_messages'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible chantier_messages.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_chantier_messages'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.chantier_messages'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on chantier_messages';
 END IF;
END $$;
CREATE TEMP TABLE expected_chantier_cutoff_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL ,
  cutoff_type TEXT NOT NULL CHECK (cutoff_type IN ('eau', 'electricite', 'gaz')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date_estimated TIMESTAMPTZ,
  floors_affected TEXT,
  message TEXT,
  notice_pdf_url TEXT,
  created_by UUID ,
  created_at TIMESTAMPTZ DEFAULT NOW()
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.chantier_cutoff_notices'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_chantier_cutoff_notices'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible chantier_cutoff_notices.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_chantier_cutoff_notices'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.chantier_cutoff_notices'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on chantier_cutoff_notices';
 END IF;
END $$;
CREATE TEMP TABLE expected_chantier_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL ,
  user_id UUID ,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.chantier_photos'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_chantier_photos'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible chantier_photos.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_chantier_photos'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.chantier_photos'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on chantier_photos';
 END IF;
END $$;
CREATE TEMP TABLE expected_company_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 iban text NOT NULL DEFAULT '', vat_number text NOT NULL DEFAULT '', logo_url text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.company_settings'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_company_settings'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible company_settings.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_company_settings'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.company_settings'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on company_settings';
 END IF;
END $$;
CREATE TEMP TABLE expected_leave_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), technician_id uuid NOT NULL ,
 start_date date NOT NULL, end_date date NOT NULL, reason text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 rejection_reason text, reviewed_by uuid , reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (end_date >= start_date)
) ON COMMIT DROP;
DO $$
DECLARE mismatch text;
BEGIN
 SELECT e.attname INTO mismatch FROM pg_attribute e LEFT JOIN pg_attribute a
  ON a.attrelid='public.leave_requests'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='expected_leave_requests'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull) LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Incompatible leave_requests.% column', mismatch; END IF;
 IF EXISTS (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='expected_leave_requests'::regclass
    EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.leave_requests'::regclass) THEN
   RAISE EXCEPTION 'Incompatible constraints on leave_requests';
 END IF;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT * FROM (VALUES ('chantier_details','intervention_id','interventions','c'),('chantier_messages','intervention_id','interventions','c'),('chantier_messages','author_id','users','a'),('chantier_cutoff_notices','intervention_id','interventions','c'),('chantier_cutoff_notices','created_by','users','a'),('chantier_photos','intervention_id','interventions','c'),('chantier_photos','user_id','users','a'),('leave_requests','technician_id','users','a'),('leave_requests','reviewed_by','users','a')) AS expected(tbl,col,target,del) LOOP
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
 WHERE c.contype='f' AND c.conrelid=format('public.%I',f.tbl)::regclass AND a.attname=f.col
 AND c.confrelid=format('public.%I',f.target)::regclass AND c.confdeltype::text=f.del) THEN
 RAISE EXCEPTION 'Incompatible foreign key %.%',f.tbl,f.col; END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.report_photo_scope(object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.is_active=true
  AND (split_part(object_name,'/',2)<>'reports' OR (
    object_name ~ '^[0-9a-f-]{36}/reports/[0-9a-f-]{36}/(before|after)/[0-9a-f-]{36}\.jpg$'
    AND EXISTS (SELECT 1 FROM public.interventions i
      WHERE i.id::text=split_part(object_name,'/',3)
      AND i.technician_id::text=split_part(object_name,'/',1)
      AND (u.role IN ('admin','secretary') OR (u.role='technician' AND u.id=i.technician_id)))
  )));
$$;
REVOKE ALL ON FUNCTION public.report_photo_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_photo_scope(text) TO authenticated;
-- Restrictive policy intersects existing policies; it cannot grant new access.
CREATE POLICY photos_report_scope ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id<>'photos' OR public.report_photo_scope(name))
 WITH CHECK (bucket_id<>'photos' OR public.report_photo_scope(name));
COMMIT;

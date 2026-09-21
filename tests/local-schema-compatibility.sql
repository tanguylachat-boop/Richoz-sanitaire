BEGIN;
DO $test$ BEGIN
 BEGIN
 ALTER TABLE public.reports ALTER COLUMN revision_requested DROP DEFAULT; ALTER TABLE public.reports ALTER COLUMN revision_requested TYPE text USING revision_requested::text;
 EXECUTE $guard$DO $$
DECLARE c record; actual text;
BEGIN
 FOR c IN SELECT * FROM (VALUES
 ('users','birth_date','date','date'),
 ('interventions','intervention_type','text','text NOT NULL DEFAULT ''depannage'' CHECK (intervention_type IN (''depannage'',''chantier''))'),
 ('email_inbox','is_read','boolean','boolean NOT NULL DEFAULT false'),
 ('reports','supplies_text','text','text'),
 ('reports','client_signature','text','text'),
 ('reports','is_completed','boolean','boolean NOT NULL DEFAULT true'),
 ('reports','revision_requested','boolean','boolean NOT NULL DEFAULT false'),
 ('reports','revision_message','text','text'),
 ('reports','pdf_url','text','text'),
 ('notifications','recipient_id','uuid','uuid REFERENCES public.users(id)'),
 ('notifications','sender_id','uuid','uuid REFERENCES public.users(id)'),
 ('notifications','reference_id','uuid','uuid'),
 ('notifications','reference_type','text','text')
 ) AS fields(tbl,col,typ,ddl) LOOP
   SELECT format_type(atttypid,atttypmod) INTO actual FROM pg_attribute
    WHERE attrelid = format('public.%I',c.tbl)::regclass AND attname=c.col AND NOT attisdropped;
   IF actual IS NULL THEN EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s',c.tbl,c.col,c.ddl);
   ELSIF actual <> c.typ THEN RAISE EXCEPTION 'Incompatible %.%: expected %, found %',c.tbl,c.col,c.typ,actual;
   END IF;
 END LOOP;
END $$;$guard$;
 RAISE EXCEPTION 'Compatibility guard did not reject wrong feedback column type';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Incompatible reports.revision_requested%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: wrong feedback column type rejected by versioned migration';
 END;
END $test$;
DO $test$ BEGIN
 BEGIN
 ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_check;
 EXECUTE $guard$CREATE TEMP TABLE expected_leave_requests (
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

$guard$;
 RAISE EXCEPTION 'Compatibility guard did not reject missing date constraint';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Incompatible constraints on leave_requests' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: missing date constraint rejected by versioned migration';
 END;
END $test$;
SELECT id, public, file_size_limit FROM storage.buckets WHERE id IN ('photos','chantier-documents');
SELECT count(*) AS applied_migrations FROM supabase_migrations.schema_migrations;
ROLLBACK;

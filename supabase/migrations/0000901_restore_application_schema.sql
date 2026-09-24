-- Restore missing prerequisites before 00010/00014/00017 and the private bucket 00024.
-- Names/types are taken from the existing PRD, application types and forms.
-- No production state is assumed. Fail on incompatible existing column types.
BEGIN;
CREATE TABLE IF NOT EXISTS chantier_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
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
);

-- Journal de chantier (message feed)
CREATE TABLE IF NOT EXISTS chantier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Avis de coupure (water/electricity/gas outage notices)
CREATE TABLE IF NOT EXISTS chantier_cutoff_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  cutoff_type TEXT NOT NULL CHECK (cutoff_type IN ('eau', 'electricite', 'gaz')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date_estimated TIMESTAMPTZ,
  floors_affected TEXT,
  message TEXT,
  notice_pdf_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos de chantier (standalone photos, not tied to a report)
CREATE TABLE IF NOT EXISTS chantier_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────


CREATE INDEX IF NOT EXISTS idx_chantier_details_intervention ON chantier_details(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_messages_intervention ON chantier_messages(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_messages_created ON chantier_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chantier_cutoff_intervention ON chantier_cutoff_notices(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_photos_intervention ON chantier_photos(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_photos_created ON chantier_photos(created_at DESC);


CREATE TABLE IF NOT EXISTS public.company_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 iban text NOT NULL DEFAULT '', vat_number text NOT NULL DEFAULT '', logo_url text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.leave_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), technician_id uuid NOT NULL REFERENCES public.users(id),
 start_date date NOT NULL, end_date date NOT NULL, reason text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 rejection_reason text, reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (end_date >= start_date)
);
ALTER TABLE public.chantier_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantier_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantier_cutoff_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_read ON public.leave_requests FOR SELECT TO authenticated
 USING (technician_id = auth.uid() OR public.is_admin_or_secretary());
CREATE POLICY leave_staff ON public.leave_requests FOR ALL TO authenticated
 USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());
CREATE POLICY leave_request ON public.leave_requests FOR INSERT TO authenticated
 WITH CHECK (technician_id = auth.uid() AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);

-- Column additions are checked even when the object already exists.
DO $$
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
END $$;
COMMIT;

-- LOT 3A. No scheduler, automatic type rule, historical backfill or external channel.
BEGIN;
CREATE TABLE public.report_expectations (
 intervention_id uuid PRIMARY KEY REFERENCES public.interventions(id),
 reference_at timestamptz NOT NULL,
 due_at timestamptz CHECK (due_at >= reference_at),
 confirmed_by uuid NOT NULL REFERENCES public.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_followup_cycles (
 report_id uuid PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
 cycle uuid NOT NULL DEFAULT gen_random_uuid(),
 started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_reminder_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intervention_id uuid NOT NULL REFERENCES public.interventions(id),
 report_id uuid REFERENCES public.reports(id),
 recipient_id uuid NOT NULL REFERENCES public.users(id),
 cycle text NOT NULL,
 window_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL,
 next_allowed_at timestamptz NOT NULL,
 notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id),
 source text NOT NULL CHECK (source IN ('manual','automatic')),
 UNIQUE(intervention_id,cycle,window_at)
);
ALTER TABLE public.report_expectations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_followup_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_reminder_history ENABLE ROW LEVEL SECURITY;
-- Access only through checked functions, including history. No technician mutation policy.
REVOKE ALL ON public.report_expectations,public.report_followup_cycles,public.report_reminder_history FROM anon,authenticated;

CREATE FUNCTION public.report_followup_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('admin','secretary'))
$$;
REVOKE ALL ON FUNCTION public.report_followup_staff() FROM PUBLIC,anon,authenticated,service_role;


-- An assigned technician can complete work through the existing workflow, but cannot
-- remove the recipient or cancel the obligation to bypass follow-up.
CREATE FUNCTION public.report_followup_intervention_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role()='authenticated' AND NOT public.report_followup_staff() AND
 (NEW.technician_id IS DISTINCT FROM OLD.technician_id OR
  (NEW.status::text IN ('annule','cancelled') AND NEW.status IS DISTINCT FROM OLD.status)) THEN
  RAISE EXCEPTION 'Cancellation and reassignment require staff' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.report_followup_intervention_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER report_followup_intervention_guard BEFORE UPDATE ON public.interventions
 FOR EACH ROW EXECUTE FUNCTION public.report_followup_intervention_guard();

-- Serialize report changes with reminder transactions and intervention reassignment/cancellation.
-- Separate trigger: the existing correction/resubmission guard is unchanged.
CREATE FUNCTION public.report_followup_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.interventions WHERE id IN (NEW.intervention_id, CASE WHEN TG_OP='UPDATE' THEN OLD.intervention_id END) ORDER BY id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER report_followup_lock BEFORE INSERT OR UPDATE ON public.reports
 FOR EACH ROW EXECUTE FUNCTION public.report_followup_lock();
CREATE FUNCTION public.report_followup_cycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.revision_requested OR NEW.status='rejected' THEN
   INSERT INTO public.report_followup_cycles(report_id) VALUES(NEW.id);
  END IF;
 ELSIF (NEW.revision_requested AND NOT coalesce(OLD.revision_requested,false))
    OR (NEW.status='rejected' AND OLD.status NOT IN ('rejected','draft')) THEN
  INSERT INTO public.report_followup_cycles(report_id) VALUES(NEW.id)
  ON CONFLICT(report_id) DO UPDATE SET cycle=gen_random_uuid(),started_at=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_followup_cycle AFTER INSERT OR UPDATE ON public.reports
 FOR EACH ROW EXECUTE FUNCTION public.report_followup_cycle();
REVOKE ALL ON FUNCTION public.report_followup_lock(),public.report_followup_cycle() FROM PUBLIC,anon,authenticated,service_role;

-- One row per intervention, never per assignment/notification/version.
-- Multiple reports cannot be resolved into a common obligation without a business decision.
CREATE FUNCTION public.report_followup_rows() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
 'intervention_id',i.id,'title',i.title,'intervention_type',i.intervention_type,
 'technician_id',i.technician_id,'technician_name',concat_ws(' ',u.first_name,u.last_name),
 'report_id',r.id,'report_count',rc.n,'confirmed',e.intervention_id IS NOT NULL,
 'state',CASE WHEN rc.n>1 THEN 'ambiguous' WHEN r.id IS NOT NULL AND r.status IS NULL THEN 'incomplete' WHEN r.status='validated' THEN 'validated'
   WHEN r.status='submitted' THEN 'submitted' WHEN r.status='rejected' OR r.revision_requested THEN 'correction'
   WHEN r.status='draft' THEN 'draft' WHEN e.intervention_id IS NOT NULL THEN 'absent' ELSE 'unconfirmed' END,
 'reference_at',coalesce(e.reference_at,r.created_at),'due_at',e.due_at,
 'cycle',coalesce(c.cycle::text,'submission:'||i.id::text),
 'cycle_at',coalesce(c.started_at,r.created_at,e.reference_at),
 'last_reminder_at',h.created_at,'last_reminder_id',h.id,'next_allowed_at',h.next_allowed_at,
 'exclusion',CASE WHEN i.status='annule' THEN 'Intervention annulée'
   WHEN i.status IS NULL THEN 'État de l’intervention manquant'
   WHEN rc.n>1 THEN 'Plusieurs rapports : obligation à clarifier'
   WHEN e.intervention_id IS NULL AND r.id IS NULL THEN 'Obligation non confirmée'
   WHEN i.technician_id IS NULL THEN 'Responsable non défini'
   WHEN NOT coalesce(u.is_active,false) OR u.role<>'technician' THEN 'Responsable inactif ou non technicien'
   WHEN r.id IS NOT NULL AND r.technician_id<>i.technician_id THEN 'Réaffectation : auteur et responsable différents'
   WHEN r.status IN ('submitted','validated') THEN 'Rapport déjà envoyé'
   WHEN r.id IS NOT NULL AND r.status IS NULL THEN 'Statut du rapport manquant'
   WHEN (r.status='rejected' OR r.revision_requested) AND nullif(btrim(r.revision_message),'') IS NULL THEN 'Commentaire de correction manquant'
   ELSE NULL END
 )
 FROM public.interventions i
 LEFT JOIN public.users u ON u.id=i.technician_id
 LEFT JOIN public.report_expectations e ON e.intervention_id=i.id
 CROSS JOIN LATERAL (SELECT count(*) n FROM public.reports WHERE intervention_id=i.id) rc
 LEFT JOIN LATERAL (SELECT * FROM public.reports WHERE intervention_id=i.id ORDER BY created_at,id LIMIT 1) r ON true
 LEFT JOIN public.report_followup_cycles c ON c.report_id=r.id
 LEFT JOIN LATERAL (SELECT id,created_at,next_allowed_at FROM public.report_reminder_history WHERE intervention_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1) h ON true
 WHERE e.intervention_id IS NOT NULL OR rc.n>0 OR i.status::text IN ('termine','facture','ready_to_bill','billed')
$$;
REVOKE ALL ON FUNCTION public.report_followup_rows() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_report_followup() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.report_followup_staff() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x) FROM public.report_followup_rows() x),'[]');
END $$;
CREATE FUNCTION public.confirm_report_expectation(p_intervention uuid,p_reference timestamptz,p_due timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.report_followup_staff() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.interventions WHERE id=p_intervention AND status<>'annule' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intervention inaccessible ou annulée'; END IF;
 IF p_reference IS NULL OR NOT isfinite(p_reference) OR (p_due IS NOT NULL AND NOT isfinite(p_due)) THEN RAISE EXCEPTION 'Date requise'; END IF;
 INSERT INTO public.report_expectations(intervention_id,reference_at,due_at,confirmed_by)
 VALUES(p_intervention,p_reference,p_due,auth.uid());
END $$;

-- Private engine: transaction holds the intervention lock until both notification AND history commit.
CREATE FUNCTION public.report_reminder_one(p_intervention uuid,p_now timestamptz,p_config jsonb,p_dry boolean,p_manual boolean,p_expected uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; reason text; delay_seconds integer; interval_seconds integer; max_count integer;
 activation timestamptz; reference_at timestamptz; reminder_window timestamptz; notification uuid; report public.reports%ROWTYPE;
BEGIN
 delay_seconds:=(p_config->>'first_delay_seconds')::integer;
 interval_seconds:=(p_config->>'interval_seconds')::integer;
 max_count:=(p_config->>'max_repetitions')::integer;
 activation:=(p_config->>'activation_at')::timestamptz;
 IF interval_seconds IS NULL OR interval_seconds<=0 OR (max_count IS NOT NULL AND max_count<=0)
 OR (NOT p_manual AND (delay_seconds IS NULL OR delay_seconds<0 OR activation IS NULL OR NOT isfinite(activation))) THEN
  RAISE EXCEPTION 'Paramètres de rappel incomplets ou invalides';
 END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'Invalid clock'; END IF;
 PERFORM 1 FROM public.interventions WHERE id=p_intervention FOR UPDATE;
 -- Report writers acquire the same intervention lock; no state/recipient change can commit here.
 SELECT x INTO row_data FROM public.report_followup_rows() x WHERE x->>'intervention_id'=p_intervention::text;
 reason:=coalesce(row_data->>'exclusion',CASE WHEN row_data IS NULL THEN 'Obligation introuvable' END);
 IF reason IS NULL AND p_manual AND (row_data->>'last_reminder_id')::uuid IS DISTINCT FROM p_expected THEN reason:='Vue périmée : recharger'; END IF;
 reference_at:=greatest((row_data->>'reference_at')::timestamptz,(row_data->>'cycle_at')::timestamptz);
 IF reason IS NULL AND NOT p_manual THEN
  IF (row_data->>'reference_at')::timestamptz IS NULL OR (row_data->>'reference_at')::timestamptz<activation THEN reason:='Historique antérieur à la mise en service';
  ELSIF p_now<activation THEN reason:='Mise en service future';
  ELSIF p_now<greatest((row_data->>'due_at')::timestamptz,reference_at)+make_interval(secs=>delay_seconds) THEN reason:='Premier délai non atteint'; END IF;
 END IF;
 IF reason IS NULL AND greatest((row_data->>'next_allowed_at')::timestamptz,(row_data->>'last_reminder_at')::timestamptz+make_interval(secs=>interval_seconds))>p_now THEN reason:='Intervalle minimal non atteint'; END IF;
 IF reason IS NULL AND max_count IS NOT NULL AND (SELECT count(*) FROM public.report_reminder_history WHERE intervention_id=p_intervention AND cycle=row_data->>'cycle')>=max_count THEN reason:='Limite de répétition atteinte'; END IF;
 IF reason IS NOT NULL THEN RETURN jsonb_build_object('intervention_id',p_intervention,'result','excluded','reason',reason); END IF;
 reminder_window:=to_timestamp(floor(extract(epoch FROM p_now)/interval_seconds)*interval_seconds);
 IF EXISTS(SELECT 1 FROM public.report_reminder_history WHERE intervention_id=p_intervention AND cycle=row_data->>'cycle' AND report_reminder_history.window_at=reminder_window) THEN
  RETURN jsonb_build_object('intervention_id',p_intervention,'result','excluded','reason','Fenêtre déjà rappelée');
 END IF;
 IF p_dry THEN RETURN jsonb_build_object('intervention_id',p_intervention,'result','would_create','state',row_data->>'state','recipient_id',row_data->>'technician_id'); END IF;
 SELECT * INTO report FROM public.reports WHERE id=(row_data->>'report_id')::uuid;
 INSERT INTO public.notifications(user_id,recipient_id,title,message,type,intervention_id,reference_id,reference_type)
 VALUES((row_data->>'technician_id')::uuid,(row_data->>'technician_id')::uuid,
 CASE WHEN row_data->>'state'='correction' THEN 'Rapport à corriger' ELSE 'Rapport à envoyer' END,
 'Intervention : '||(row_data->>'title')||CASE WHEN row_data->>'state'='correction' THEN E'\n'||report.revision_message WHEN row_data->>'state'='draft' THEN E'\nVotre brouillon reste à envoyer.' ELSE E'\nLe rapport attendu reste à remettre.' END,
 CASE WHEN row_data->>'state'='correction' THEN 'revision_requested' ELSE 'report_reminder' END,p_intervention,
 coalesce(report.id,p_intervention),CASE WHEN report.id IS NULL THEN 'intervention' ELSE 'report' END)
 RETURNING id INTO notification;
 INSERT INTO public.report_reminder_history(intervention_id,report_id,recipient_id,cycle,window_at,created_at,next_allowed_at,notification_id,source)
 VALUES(p_intervention,report.id,(row_data->>'technician_id')::uuid,row_data->>'cycle',reminder_window,p_now,p_now+make_interval(secs=>interval_seconds),notification,CASE WHEN p_manual THEN 'manual' ELSE 'automatic' END);
 RETURN jsonb_build_object('intervention_id',p_intervention,'result','created','notification_id',notification);
END $$;
REVOKE ALL ON FUNCTION public.report_reminder_one(uuid,timestamptz,jsonb,boolean,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.remind_report(p_intervention uuid,p_interval_seconds integer,p_expected uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.report_followup_staff() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN public.report_reminder_one(p_intervention,clock_timestamp(),jsonb_build_object('interval_seconds',p_interval_seconds),false,true,p_expected);
END $$;
-- Protected service entry. No schedule installed. Caller must explicitly enable execution.
CREATE FUNCTION public.run_report_reminders(p_config jsonb,p_dry boolean DEFAULT true,p_now timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; result jsonb:='[]';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT p_dry AND coalesce((p_config->>'enabled')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Automatisation désactivée'; END IF;
 FOR item IN SELECT x FROM public.report_followup_rows() x ORDER BY x->>'intervention_id' LOOP
  result:=result||jsonb_build_array(public.report_reminder_one((item->>'intervention_id')::uuid,p_now,p_config,p_dry,false));
 END LOOP;
 RETURN jsonb_build_object('simulation',p_dry,'obligations', (SELECT coalesce(jsonb_agg(x),'[]') FROM public.report_followup_rows() x),'results',result);
END $$;
REVOKE ALL ON FUNCTION public.get_report_followup(),public.confirm_report_expectation(uuid,timestamptz,timestamptz),public.remind_report(uuid,integer,uuid),public.run_report_reminders(jsonb,boolean,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_report_followup(),public.confirm_report_expectation(uuid,timestamptz,timestamptz),public.remind_report(uuid,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_report_reminders(jsonb,boolean,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

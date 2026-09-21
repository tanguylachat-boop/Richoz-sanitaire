-- Run only in the isolated local database. Everything, including fixtures and fault trigger,
-- rolls back. The exception block exercises real PostgreSQL transactional rollback.
BEGIN;
CREATE FUNCTION public.lot3a_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.message LIKE 'Intervention : LOT3A-FAIL-INJECT%' THEN RAISE EXCEPTION 'injected notification failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lot3a_injected_failure BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.lot3a_injected_failure();
CREATE FUNCTION public.lot3a_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.interventions WHERE id=NEW.intervention_id AND title='LOT3A-HISTORY-FAIL') THEN RAISE EXCEPTION 'injected notification failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lot3a_history_failure BEFORE INSERT ON public.report_reminder_history FOR EACH ROW EXECUTE FUNCTION public.lot3a_history_failure();
DO $$
DECLARE staff uuid; tech uuid; iv uuid; result jsonb; n integer; mode integer;
BEGIN
 SELECT id INTO staff FROM public.users WHERE email LIKE 'lot3a-secretary-%@example.invalid' AND is_active LIMIT 1;
 SELECT id INTO tech FROM public.users WHERE email LIKE 'lot3a-tech-%@example.invalid' AND is_active LIMIT 1;
 IF staff IS NULL OR tech IS NULL THEN RAISE EXCEPTION 'Local fictitious fixtures required'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',staff)::text,true);
 FOR mode IN 1..2 LOOP
 INSERT INTO public.interventions(title,address,technician_id,status,intervention_type) VALUES(CASE WHEN mode=1 THEN 'LOT3A-FAIL-INJECT' ELSE 'LOT3A-HISTORY-FAIL' END,'Fictif',tech,'termine','depannage') RETURNING id INTO iv;
 PERFORM public.confirm_report_expectation(iv,now(),null);
 BEGIN
  PERFORM public.remind_report(iv,60,null);
  RAISE EXCEPTION 'Expected injected failure';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'injected notification failure' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM public.report_reminder_history WHERE intervention_id=iv;
 IF n<>0 THEN RAISE EXCEPTION 'False success history'; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE intervention_id=iv;
 IF n<>0 THEN RAISE EXCEPTION 'Partial notification persisted'; END IF;
 UPDATE public.interventions SET title='LOT3A successful retry' WHERE id=iv;
 result:=public.remind_report(iv,60,null);
 IF result->>'result'<>'created' THEN RAISE EXCEPTION 'Retry failed: %',result; END IF;
 result:=public.remind_report(iv,60,null);
 IF result->>'result'<>'excluded' THEN RAISE EXCEPTION 'Retry duplicated'; END IF;
 SELECT count(*) INTO n FROM public.report_reminder_history WHERE intervention_id=iv;
 IF n<>1 THEN RAISE EXCEPTION 'Expected one successful history entry'; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE intervention_id=iv;
 IF n<>1 THEN RAISE EXCEPTION 'Expected one notification'; END IF;
 RAISE NOTICE 'PASS real failure stage % -> rollback -> retry -> one notification and one history',mode;
 END LOOP;
END $$;
ROLLBACK;

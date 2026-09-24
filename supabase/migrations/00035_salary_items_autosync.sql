-- ============================================================================
-- Migration 00035 — Auto-synchronisation des éléments de salaire (salary_items)
-- ============================================================================
-- Objectif client : éviter la re-saisie manuelle des éléments de paie qui ont
-- une SOURCE identifiable. On auto-crée les salary_items en statut 'pending'
-- (« à valider ») pour les DEUX seuls types sourçables :
--   * piquet         ← piquet_schedule (semaine COMPLÈTE uniquement)
--   * sans_solde     ← leave_requests (leave_type='sans_solde' & status='approved')
--
-- Ce qui n'est PAS touché : retard, amende_parc, heures_sup (aucune source →
-- restent 100 % manuels). Les montants/durées/périodes sont dérivés par le
-- trigger existant validate_salary_item (00031) — on ne recalcule RIEN ici.
--
-- Garanties de non-régression :
--   * Semaine de piquet PARTIELLE (nb jours non multiple de 7) → on N'INSÈRE PAS
--     (sinon validate_salary_item lève PIQUET_SEMAINE_INCOMPLETE et ferait
--     échouer l'INSERT/UPDATE du piquet_schedule lui-même). L'admin gère les
--     semaines partielles à la main.
--   * Idempotence : un test d'existence évite tout doublon. (L'index unique
--     idx_salary_items_unique_source est partiel — il ignore cancelled/rejected —
--     donc ON CONFLICT ne peut pas cibler la contrainte proprement ; on teste
--     donc explicitement l'existence d'un item non annulé.)
--   * Nettoyage (source devenue inéligible) → l'item auto-créé passe 'cancelled',
--     SAUF s'il est figé en paie (payroll_status='included' → PAIE_FIGEE, intact).
--     On ne touche jamais un item origin='manual'.
--
-- Additif : aucune donnée détruite. validate_salary_item est republié
-- (CREATE OR REPLACE) à l'identique + une seule garde en tête autorisant la
-- transition d'annulation (cancelled/rejected) sans revalider une source
-- devenue invalide — indispensable pour que le nettoyage fonctionne.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) validate_salary_item : garde d'annulation ajoutée en tête.
--    Corps identique à 00031 pour tout le reste. La garde se place APRÈS le
--    check PAIE_FIGEE : un item 'included' reste protégé, un item annulable
--    passe sans revalidation de sa source (qui vient justement de disparaître).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_salary_item()
RETURNS TRIGGER AS $$
DECLARE
  leave_row public.leave_requests%ROWTYPE;
  piquet_row public.piquet_schedule%ROWTYPE;
  span_days integer;
BEGIN
  -- Une paie figée ne se modifie pas silencieusement (régularisation au lot 6B).
  IF TG_OP = 'UPDATE' AND OLD.payroll_status = 'included' THEN
    RAISE EXCEPTION 'PAIE_FIGEE: élément déjà intégré à une paie, passer par une régularisation.';
  END IF;

  -- GARDE D'ANNULATION (00035) : autoriser la mise au rebut d'un item auto-créé
  -- dont la source est devenue invalide, sans re-dériver depuis cette source.
  -- Ne s'applique jamais à un item figé (bloqué au-dessus). Ne modifie pas les
  -- valeurs dérivées existantes (montant/période conservés pour la traçabilité).
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('cancelled', 'rejected')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.item_type = 'sans_solde' THEN
    SELECT * INTO leave_row FROM public.leave_requests WHERE id = NEW.source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_INTROUVABLE: congé sans solde source inexistant.';
    END IF;
    IF leave_row.leave_type <> 'sans_solde' OR leave_row.status <> 'approved' THEN
      RAISE EXCEPTION 'SOURCE_INVALIDE: seul un congé sans solde APPROUVÉ est consommable.';
    END IF;
    IF leave_row.technician_id <> NEW.technician_id THEN
      RAISE EXCEPTION 'MAUVAIS_COLLABORATEUR: le congé source appartient à un autre collaborateur.';
    END IF;
    -- Valeurs dérivées de la source, jamais saisies à la main.
    NEW.minutes := public.leave_request_minutes(leave_row);
    NEW.period_start := leave_row.start_date;
    NEW.period_end := leave_row.end_date;
    NEW.item_date := leave_row.start_date;
    NEW.amount_chf := NULL; -- tarif de déduction inconnu : rien n'est inventé
    NEW.payroll_status := CASE WHEN NEW.payroll_status = 'included' THEN NEW.payroll_status ELSE 'requires_rule' END;

  ELSIF NEW.item_type = 'piquet' THEN
    SELECT * INTO piquet_row FROM public.piquet_schedule WHERE id = NEW.source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_INTROUVABLE: semaine de piquet source inexistante.';
    END IF;
    IF piquet_row.technician_id <> NEW.technician_id THEN
      RAISE EXCEPTION 'MAUVAIS_COLLABORATEUR: cette semaine de piquet est attribuée à un autre technicien.';
    END IF;
    IF NEW.period_start IS NULL THEN NEW.period_start := piquet_row.start_date; END IF;
    IF NEW.period_end IS NULL THEN NEW.period_end := piquet_row.end_date; END IF;
    IF NEW.period_start < piquet_row.start_date OR NEW.period_end > piquet_row.end_date THEN
      RAISE EXCEPTION 'PERIODE_HORS_SOURCE: la période dépasse la planification de piquet.';
    END IF;
    span_days := NEW.period_end - NEW.period_start + 1;
    IF span_days % 7 <> 0 THEN
      -- Prorata/semaine partagée non défini par le client : refus explicite.
      RAISE EXCEPTION 'PIQUET_SEMAINE_INCOMPLETE: % jours ; le prorata d''une semaine partielle n''est pas défini, à faire valider.', span_days;
    END IF;
    -- Règle client validée : 150 CHF par semaine complète attribuée.
    NEW.amount_chf := 150.00 * (span_days / 7);
    NEW.item_date := NEW.period_start;
    NEW.payroll_status := CASE WHEN NEW.payroll_status IN ('included', 'excluded') THEN NEW.payroll_status ELSE 'not_processed' END;

  ELSIF NEW.item_type = 'retard' THEN
    IF NEW.expected_time IS NULL OR NEW.actual_time IS NULL OR NEW.actual_time <= NEW.expected_time THEN
      RAISE EXCEPTION 'RETARD_INVALIDE: heure attendue et heure réelle (postérieure) requises.';
    END IF;
    NEW.minutes := (EXTRACT(EPOCH FROM (NEW.actual_time - NEW.expected_time)) / 60)::integer;
    -- Effet salarial inconnu (pas d'amende forfaitaire inventée).
    NEW.amount_chf := NULL;
    NEW.payroll_status := CASE WHEN NEW.payroll_status IN ('included', 'excluded') THEN NEW.payroll_status ELSE 'requires_rule' END;

  ELSIF NEW.item_type = 'amende_parc' THEN
    IF NEW.amount_chf IS NULL OR NEW.amount_chf <= 0 THEN
      RAISE EXCEPTION 'AMENDE_INVALIDE: montant CHF positif requis.';
    END IF;
    -- La saisie ne vaut pas retenue : imputabilité à examiner.
    NEW.payroll_status := CASE WHEN NEW.payroll_status IN ('included', 'excluded') THEN NEW.payroll_status ELSE 'requires_rule' END;

  ELSIF NEW.item_type = 'heures_sup' THEN
    IF NEW.minutes IS NULL OR NEW.minutes <= 0 THEN
      RAISE EXCEPTION 'HEURES_SUP_INVALIDES: durée en minutes positive requise.';
    END IF;
    IF NEW.compensation_mode IS NULL THEN NEW.compensation_mode := 'pending_rule'; END IF;
    -- Taux/majoration CCT non validés : montant jamais calculé ici.
    NEW.amount_chf := NULL;
    NEW.payroll_status := CASE WHEN NEW.payroll_status IN ('included', 'excluded') THEN NEW.payroll_status ELSE 'requires_rule' END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- A) piquet_schedule → salary_item piquet (semaine COMPLÈTE uniquement)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.autosync_salary_item_piquet()
RETURNS TRIGGER AS $$
DECLARE
  span_days integer;
  creator uuid;
BEGIN
  span_days := NEW.end_date - NEW.start_date + 1;

  -- Semaine partielle : ne rien insérer (sinon PIQUET_SEMAINE_INCOMPLETE
  -- casserait l'écriture du piquet_schedule). L'admin gère à la main.
  IF span_days % 7 <> 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotence : pas de doublon actif pour cette source.
  IF EXISTS (
    SELECT 1 FROM public.salary_items
    WHERE item_type = 'piquet'
      AND source_id = NEW.id
      AND status NOT IN ('cancelled', 'rejected')
  ) THEN
    RETURN NEW;
  END IF;

  -- created_by est NOT NULL : on prend l'auteur du piquet, à défaut le technicien.
  creator := COALESCE(NEW.created_by, NEW.technician_id);

  INSERT INTO public.salary_items (
    technician_id, item_type, item_date, origin, source_id, status, created_by
  ) VALUES (
    NEW.technician_id,
    'piquet',
    NEW.start_date,           -- posé pour satisfaire NOT NULL ; validate_salary_item le confirme
    'piquet_schedule',
    NEW.id,
    'pending',                -- « à valider » (statut initial d'une saisie manuelle)
    creator
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_piquet_schedule_autosync ON public.piquet_schedule;
CREATE TRIGGER tr_piquet_schedule_autosync
  AFTER INSERT OR UPDATE ON public.piquet_schedule
  FOR EACH ROW EXECUTE FUNCTION public.autosync_salary_item_piquet();

-- ----------------------------------------------------------------------------
-- B) leave_requests (sans_solde + approved) → salary_item sans_solde
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.autosync_salary_item_sans_solde()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.leave_type = 'sans_solde' AND NEW.status = 'approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.salary_items
      WHERE item_type = 'sans_solde'
        AND source_id = NEW.id
        AND status NOT IN ('cancelled', 'rejected')
    ) THEN
      INSERT INTO public.salary_items (
        technician_id, item_type, item_date, origin, source_id, status, created_by
      ) VALUES (
        NEW.technician_id,
        'sans_solde',
        NEW.start_date,       -- posé pour NOT NULL ; validate_salary_item le confirme
        'leave_request',
        NEW.id,
        'pending',
        COALESCE(NEW.reviewed_by, NEW.technician_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_leave_requests_autosync ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_autosync
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.autosync_salary_item_sans_solde();

-- ----------------------------------------------------------------------------
-- C) NETTOYAGE — source devenue inéligible → item auto-créé 'cancelled'
--    (jamais un item 'included' figé, jamais un item origin='manual')
-- ----------------------------------------------------------------------------

-- C.1 leave_request : n'est plus (sans_solde ET approved) → cancel l'item lié.
CREATE OR REPLACE FUNCTION public.autosync_cancel_salary_item_leave()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (NEW.leave_type = 'sans_solde' AND NEW.status = 'approved') THEN
    UPDATE public.salary_items
       SET status = 'cancelled'
     WHERE item_type = 'sans_solde'
       AND source_id = NEW.id
       AND origin = 'leave_request'
       AND status NOT IN ('cancelled', 'rejected')
       AND payroll_status <> 'included';   -- PAIE_FIGEE : intouchable
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_leave_requests_autosync_cancel ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_autosync_cancel
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.autosync_cancel_salary_item_leave();

-- C.2 leave_request supprimé → cancel l'item lié (sauf figé).
CREATE OR REPLACE FUNCTION public.autosync_cancel_salary_item_leave_del()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.salary_items
     SET status = 'cancelled'
   WHERE item_type = 'sans_solde'
     AND source_id = OLD.id
     AND origin = 'leave_request'
     AND status NOT IN ('cancelled', 'rejected')
     AND payroll_status <> 'included';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_leave_requests_autosync_cancel_del ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_autosync_cancel_del
  BEFORE DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.autosync_cancel_salary_item_leave_del();

-- C.3 piquet_schedule supprimé → cancel l'item lié (sauf figé).
CREATE OR REPLACE FUNCTION public.autosync_cancel_salary_item_piquet_del()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.salary_items
     SET status = 'cancelled'
   WHERE item_type = 'piquet'
     AND source_id = OLD.id
     AND origin = 'piquet_schedule'
     AND status NOT IN ('cancelled', 'rejected')
     AND payroll_status <> 'included';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_piquet_schedule_autosync_cancel_del ON public.piquet_schedule;
CREATE TRIGGER tr_piquet_schedule_autosync_cancel_del
  BEFORE DELETE ON public.piquet_schedule
  FOR EACH ROW EXECUTE FUNCTION public.autosync_cancel_salary_item_piquet_del();

-- C.4 piquet_schedule dont la semaine devient partielle (UPDATE des dates) →
--     cancel l'item lié (sauf figé). Le trigger A n'en recrée pas (partiel).
CREATE OR REPLACE FUNCTION public.autosync_cancel_salary_item_piquet_partial()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.end_date - NEW.start_date + 1) % 7 <> 0 THEN
    UPDATE public.salary_items
       SET status = 'cancelled'
     WHERE item_type = 'piquet'
       AND source_id = NEW.id
       AND origin = 'piquet_schedule'
       AND status NOT IN ('cancelled', 'rejected')
       AND payroll_status <> 'included';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_piquet_schedule_autosync_cancel_partial ON public.piquet_schedule;
CREATE TRIGGER tr_piquet_schedule_autosync_cancel_partial
  AFTER UPDATE ON public.piquet_schedule
  FOR EACH ROW EXECUTE FUNCTION public.autosync_cancel_salary_item_piquet_partial();

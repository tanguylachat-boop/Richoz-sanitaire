-- ============================================================================
-- Migration 00031 — LOT 6A : éléments variables de salaire (saisie)
-- ============================================================================
-- Saisie et validation des éléments variables demandés par le client :
-- congés sans solde (consommés depuis leave_requests), retards, amendes de
-- stationnement (CHF), heures supplémentaires, piquet 150 CHF par semaine
-- complète attribuée (source piquet_schedule existante).
--
-- Principes :
-- * Réutilisation des entités existantes : un élément « sans_solde » ou
--   « piquet » RÉFÉRENCE sa source (leave_requests / piquet_schedule) et un
--   index unique interdit de consommer deux fois la même source (pas de
--   double décompte via deux chemins).
-- * Montants en NUMERIC(10,2) CHF (convention du dépôt), durées en minutes
--   entières : aucun arrondi cumulé.
-- * AUCUNE règle salariale inventée : le traitement paie des retards,
--   amendes, heures sup (taux/majoration/CCT) et du tarif sans solde est
--   inconnu → payroll_status = 'requires_rule' (« à configurer/à valider »),
--   jamais un montant inventé ni un faux zéro. Seul le piquet a une règle
--   client validée : 150 CHF par semaine complète.
-- * Semaine de piquet partielle : prorata NON défini par le client → refus
--   explicite (PIQUET_SEMAINE_INCOMPLETE), à valider avant activation.
-- * AUCUNE pénalité automatique liée à un rapport manquant (exigence
--   conservée mais non activée).
-- * Un élément intégré à une paie (payroll_status='included', posé par le
--   futur lot 6B) devient non modifiable/supprimable (PAIE_FIGEE) : les
--   corrections passeront par des régularisations explicites.
-- * Historique inviolable comme pour les congés (trigger SECURITY DEFINER).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.users(id),
  item_type text NOT NULL CHECK (item_type IN ('sans_solde', 'retard', 'amende_parc', 'heures_sup', 'piquet')),
  item_date date NOT NULL,
  period_start date,
  period_end date,
  minutes integer CHECK (minutes IS NULL OR minutes > 0),
  amount_chf numeric(10,2) CHECK (amount_chf IS NULL OR amount_chf > 0),
  expected_time time,
  actual_time time,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'leave_request', 'piquet_schedule')),
  source_id uuid,
  reason text,
  justification text,
  compensation_mode text CHECK (compensation_mode IN ('paid', 'recovered', 'pending_rule')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_note text,
  payroll_status text NOT NULL DEFAULT 'requires_rule'
    CHECK (payroll_status IN ('not_processed', 'requires_rule', 'included', 'excluded')),
  payroll_reference uuid,
  payroll_processed_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_period_order CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  ),
  -- Les éléments consommés depuis une source existante doivent la référencer.
  CONSTRAINT salary_source_by_type CHECK (
    (item_type = 'sans_solde' AND origin = 'leave_request' AND source_id IS NOT NULL)
    OR (item_type = 'piquet' AND origin = 'piquet_schedule' AND source_id IS NOT NULL)
    OR (item_type IN ('retard', 'amende_parc', 'heures_sup') AND origin = 'manual')
  )
);

-- Jamais deux éléments depuis la même source (même congé, même semaine de piquet).
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_items_unique_source
  ON public.salary_items(item_type, source_id)
  WHERE source_id IS NOT NULL AND status <> 'cancelled' AND status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_salary_items_tech_date
  ON public.salary_items(technician_id, item_date DESC);
CREATE INDEX IF NOT EXISTS idx_salary_items_status
  ON public.salary_items(status, payroll_status);

-- Durée d'un congé en minutes selon la règle partagée du dépôt
-- (src/lib/leave-duration.ts) : jours calendaires × 480 min, partiel = durée
-- réelle plafonnée à 480 min. À adapter en même temps que la lib si le client
-- fournit des horaires contractuels.
CREATE OR REPLACE FUNCTION public.leave_request_minutes(l public.leave_requests)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN l.start_time IS NOT NULL AND l.end_time IS NOT NULL AND l.start_date = l.end_date
      THEN LEAST((EXTRACT(EPOCH FROM (l.end_time - l.start_time)) / 60)::integer, 480)
    ELSE (l.end_date - l.start_date + 1) * 480
  END
$$;

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

DROP TRIGGER IF EXISTS tr_salary_items_validate ON public.salary_items;
CREATE TRIGGER tr_salary_items_validate
  BEFORE INSERT OR UPDATE ON public.salary_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_salary_item();

CREATE OR REPLACE FUNCTION public.prevent_frozen_salary_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.payroll_status = 'included' THEN
    RAISE EXCEPTION 'PAIE_FIGEE: élément déjà intégré à une paie, suppression interdite.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_salary_items_no_frozen_delete ON public.salary_items;
CREATE TRIGGER tr_salary_items_no_frozen_delete
  BEFORE DELETE ON public.salary_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_frozen_salary_item_delete();

-- Historique inviolable (même modèle que leave_request_history, lot 5)
CREATE TABLE IF NOT EXISTS public.salary_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_item_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX IF NOT EXISTS idx_salary_item_history_item
  ON public.salary_item_history(salary_item_id, changed_at DESC);

ALTER TABLE public.salary_item_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_item_history_read ON public.salary_item_history;
CREATE POLICY salary_item_history_read ON public.salary_item_history
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin_or_secretary());
-- Aucune policy d'écriture : seules les écritures du trigger sont possibles.

CREATE OR REPLACE FUNCTION public.log_salary_item_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.salary_item_history (salary_item_id, technician_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.technician_id, 'create', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.salary_item_history (salary_item_id, technician_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, NEW.technician_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.salary_item_history (salary_item_id, technician_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.technician_id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_salary_items_history ON public.salary_items;
CREATE TRIGGER tr_salary_items_history
  AFTER INSERT OR UPDATE OR DELETE ON public.salary_items
  FOR EACH ROW EXECUTE FUNCTION public.log_salary_item_change();

-- RLS : saisie/gestion par admin+secrétaire ; le collaborateur voit ses éléments.
ALTER TABLE public.salary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_items_read ON public.salary_items;
CREATE POLICY salary_items_read ON public.salary_items
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin_or_secretary());

DROP POLICY IF EXISTS salary_items_staff ON public.salary_items;
CREATE POLICY salary_items_staff ON public.salary_items
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

-- ============================================================================
-- Migration 00036 — LOT 8 : config de rémunération par employé & fiche nette
-- ============================================================================
-- Débloque 6A/6B/6C : la clôture de paie était impossible faute de taux. Le
-- client a décidé que la SECRÉTAIRE configure la rémunération. Principes
-- conservés du lot 6 : aucun montant inventé, aucun faux zéro, PAIE_FIGEE,
-- l'app ne connaît AUCUN taux légal suisse (la secrétaire saisit les
-- cotisations). Voir docs/LOT-8-CONFIG-SALAIRES-DESIGN.md.
--
-- Décisions verrouillées :
--  * Modèle mixte par employé : 'monthly' (mensuel fixe) ou 'hourly' (taux × heures).
--  * Heures 'hourly' auto-préremplies (Σ durées des rapports validés) + correction.
--  * Variables valorisés depuis le taux (sans_solde/retard = min/60×taux ; heures_sup
--    = min/60×taux×(1+suppl%)) ; piquet inchangé (150/sem.) ; amende = montant saisi.
--  * Cotisations/ajouts = liste flexible de composants (%, brut OU montant fixe).
--  * Brut déterminant du % = salaire_base + heures_sup + piquet.
--  * Net = base + heures_sup + piquet + ajouts − sans_solde − retard − amende − cotisations,
--    NULL tant qu'une ligne est « à configurer » (net honnête).
--  * Override secrétaire préservé au rafraîchissement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Config de rémunération par employé (1 active, historisée)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_salary_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.users(id),
  pay_type text NOT NULL CHECK (pay_type IN ('monthly', 'hourly')),
  monthly_base_chf numeric(10,2) CHECK (monthly_base_chf IS NULL OR monthly_base_chf >= 0),
  hourly_rate_chf numeric(8,2) NOT NULL CHECK (hourly_rate_chf > 0),
  overtime_supplement_pct numeric(5,2) NOT NULL DEFAULT 25.00 CHECK (overtime_supplement_pct >= 0),
  effective_from date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un mensualisé doit avoir un salaire mensuel ; le taux horaire est TOUJOURS
  -- exigé (il chiffre les éléments variables, y compris pour les mensualisés).
  CONSTRAINT salary_config_monthly_base CHECK (pay_type <> 'monthly' OR monthly_base_chf IS NOT NULL)
);

-- Une seule config active par employé (l'historique reste consultable).
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_config_active
  ON public.employee_salary_config(technician_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.set_salary_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_salary_config_updated_at ON public.employee_salary_config;
CREATE TRIGGER tr_salary_config_updated_at
  BEFORE UPDATE ON public.employee_salary_config
  FOR EACH ROW EXECUTE FUNCTION public.set_salary_config_updated_at();

-- Historique inviolable (même modèle que salary_item_history, lot 6A).
CREATE TABLE IF NOT EXISTS public.employee_salary_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX IF NOT EXISTS idx_salary_config_history_config
  ON public.employee_salary_config_history(config_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_salary_config_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.employee_salary_config_history (config_id, technician_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.technician_id, 'create', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.employee_salary_config_history (config_id, technician_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, NEW.technician_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.employee_salary_config_history (config_id, technician_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.technician_id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_salary_config_history ON public.employee_salary_config;
CREATE TRIGGER tr_salary_config_history
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_salary_config
  FOR EACH ROW EXECUTE FUNCTION public.log_salary_config_change();

-- ----------------------------------------------------------------------------
-- B. Composants flexibles (cotisations / retenues / ajouts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_config_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.employee_salary_config(id) ON DELETE CASCADE,
  label text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('deduction', 'addition')),
  basis text NOT NULL CHECK (basis IN ('pct_gross', 'fixed')),
  pct numeric(5,2) CHECK (pct IS NULL OR (pct >= 0 AND pct <= 100)),
  amount_chf numeric(10,2) CHECK (amount_chf IS NULL OR amount_chf >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Un composant est SOIT un pourcentage du brut, SOIT un montant fixe (jamais les deux).
  CONSTRAINT component_basis_honest CHECK (
    (basis = 'pct_gross' AND pct IS NOT NULL AND amount_chf IS NULL)
    OR (basis = 'fixed' AND amount_chf IS NOT NULL AND pct IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_salary_component_config
  ON public.salary_config_component(config_id, sort_order);

-- ----------------------------------------------------------------------------
-- C. Extensions des tables de brouillon de paie
-- ----------------------------------------------------------------------------
ALTER TABLE public.payroll_drafts
  ADD COLUMN IF NOT EXISTS worked_hours numeric(8,2),
  ADD COLUMN IF NOT EXISTS worked_hours_source text NOT NULL DEFAULT 'auto'
    CHECK (worked_hours_source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS net_chf numeric(10,2);

ALTER TABLE public.payroll_draft_lines
  ADD COLUMN IF NOT EXISTS component_id uuid,
  ADD COLUMN IF NOT EXISTS overridden boolean NOT NULL DEFAULT false;

-- Nouveaux types de ligne : cotisation (retenue) et ajout (allocation, 13e, etc.).
ALTER TABLE public.payroll_draft_lines DROP CONSTRAINT IF EXISTS payroll_draft_lines_line_type_check;
ALTER TABLE public.payroll_draft_lines ADD CONSTRAINT payroll_draft_lines_line_type_check
  CHECK (line_type IN ('salaire_base', 'sans_solde', 'retard', 'amende_parc', 'heures_sup', 'piquet', 'cotisation', 'ajout'));

-- Net recalculé à chaque changement de ligne. Signe par type. NULL tant qu'une
-- ligne reste « à configurer » : jamais un net partiel présenté comme complet.
CREATE OR REPLACE FUNCTION public.recompute_payroll_net()
RETURNS TRIGGER AS $$
DECLARE
  v_draft uuid := COALESCE(NEW.draft_id, OLD.draft_id);
  v_status text;
  v_unresolved integer;
  v_net numeric(10,2);
BEGIN
  SELECT status INTO v_status FROM public.payroll_drafts WHERE id = v_draft;
  IF v_status = 'validated' THEN
    RETURN COALESCE(NEW, OLD); -- fiche figée : ne pas retoucher le net
  END IF;
  SELECT count(*) FILTER (WHERE amount_state = 'requires_rule') INTO v_unresolved
  FROM public.payroll_draft_lines WHERE draft_id = v_draft;
  IF v_unresolved > 0 THEN
    v_net := NULL;
  ELSE
    SELECT COALESCE(SUM(
      CASE line_type
        WHEN 'sans_solde' THEN -amount_chf
        WHEN 'retard' THEN -amount_chf
        WHEN 'amende_parc' THEN -amount_chf
        WHEN 'cotisation' THEN -amount_chf
        ELSE amount_chf -- salaire_base, heures_sup, piquet, ajout
      END), 0)
    INTO v_net
    FROM public.payroll_draft_lines WHERE draft_id = v_draft;
  END IF;
  UPDATE public.payroll_drafts SET net_chf = v_net
  WHERE id = v_draft AND net_chf IS DISTINCT FROM v_net;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_payroll_lines_net ON public.payroll_draft_lines;
CREATE TRIGGER tr_payroll_lines_net
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_draft_lines
  FOR EACH ROW EXECUTE FUNCTION public.recompute_payroll_net();

-- ----------------------------------------------------------------------------
-- D. Génération étendue : base chiffrée, variables valorisés, cotisations, net
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payroll_drafts(p_reference date, p_dry boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE
  v_period_end date;
  v_period_start date;
  v_tech record;
  v_draft public.payroll_drafts%ROWTYPE;
  v_latest public.payroll_drafts%ROWTYPE;
  v_cfg public.employee_salary_config%ROWTYPE;
  v_created integer := 0;
  v_refreshed integer := 0;
  v_regularizations integer := 0;
  v_would integer := 0;
  v_auto_minutes integer;
  v_hours numeric(8,2);
  v_rate numeric(8,2);
  v_suppl numeric(5,2);
  v_base_amount numeric(10,2);
  v_base_state text;
  v_base_label text;
  v_gross numeric(10,2);
  v_overrides jsonb;
BEGIN
  IF NOT (public.is_admin_or_secretary() OR auth.jwt() ->> 'role' = 'service_role') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: génération réservée à l''administration.';
  END IF;

  -- Fenêtre 26 → 25 (interprétation de travail à confirmer).
  v_period_end := make_date(EXTRACT(YEAR FROM p_reference)::int, EXTRACT(MONTH FROM p_reference)::int, 25);
  v_period_start := (v_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date;

  FOR v_tech IN
    SELECT DISTINCT u.id
    FROM public.users u
    WHERE (u.role = 'technician' AND u.is_active)
       OR u.id IN (
         SELECT si.technician_id FROM public.salary_items si
         WHERE si.status = 'approved' AND si.item_date BETWEEN v_period_start AND v_period_end
       )
  LOOP
    v_draft := NULL;
    v_latest := NULL;
    v_overrides := NULL;

    SELECT * INTO v_latest FROM public.payroll_drafts d
    WHERE d.technician_id = v_tech.id AND d.period_start = v_period_start AND d.period_end = v_period_end
    ORDER BY d.version DESC LIMIT 1;

    -- Heures auto : Σ des durées de rapports validés du technicien dans la fenêtre.
    SELECT COALESCE(SUM(r.work_duration_minutes), 0) INTO v_auto_minutes
    FROM public.reports r
    WHERE r.technician_id = v_tech.id AND r.status = 'validated'
      AND r.created_at::date BETWEEN v_period_start AND v_period_end;

    IF v_latest.id IS NULL THEN
      IF p_dry THEN v_would := v_would + 1; CONTINUE; END IF;
      INSERT INTO public.payroll_drafts (technician_id, period_start, period_end, version, generated_by, worked_hours, worked_hours_source)
      VALUES (v_tech.id, v_period_start, v_period_end, 1, auth.uid(), round(v_auto_minutes / 60.0, 2), 'auto')
      ON CONFLICT ON CONSTRAINT payroll_one_per_version DO NOTHING
      RETURNING * INTO v_draft;
      IF v_draft.id IS NULL THEN CONTINUE; END IF;
      v_hours := v_draft.worked_hours;
      v_created := v_created + 1;
    ELSIF v_latest.status = 'draft' THEN
      IF p_dry THEN v_would := v_would + 1; CONTINUE; END IF;
      v_draft := v_latest;
      -- Heures : conserver la valeur manuelle, sinon rafraîchir l'auto.
      IF v_latest.worked_hours_source = 'manual' THEN
        v_hours := v_latest.worked_hours;
      ELSE
        v_hours := round(v_auto_minutes / 60.0, 2);
        UPDATE public.payroll_drafts SET worked_hours = v_hours WHERE id = v_draft.id;
      END IF;
      -- Overrides secrétaire à préserver (clé = source stable de la ligne).
      SELECT jsonb_object_agg(k, amt) INTO v_overrides FROM (
        SELECT COALESCE(salary_item_id::text, component_id::text, line_type) AS k, amount_chf AS amt
        FROM public.payroll_draft_lines
        WHERE draft_id = v_draft.id AND overridden AND amount_chf IS NOT NULL
      ) s;
      DELETE FROM public.payroll_draft_lines WHERE draft_id = v_draft.id;
      v_refreshed := v_refreshed + 1;
    ELSE
      -- Fiche validée : régularisation explicite si éléments postérieurs.
      IF NOT EXISTS (
        SELECT 1 FROM public.salary_items si
        WHERE si.technician_id = v_tech.id AND si.status = 'approved'
          AND si.item_date BETWEEN v_period_start AND v_period_end
          AND si.payroll_status NOT IN ('included', 'excluded')
      ) THEN CONTINUE; END IF;
      IF p_dry THEN v_would := v_would + 1; CONTINUE; END IF;
      INSERT INTO public.payroll_drafts (technician_id, period_start, period_end, version, generated_by, is_regularization, notes, worked_hours, worked_hours_source)
      VALUES (v_tech.id, v_period_start, v_period_end, v_latest.version + 1, auth.uid(), true,
              'Régularisation : éléments postérieurs à la clôture de la version ' || v_latest.version,
              round(v_auto_minutes / 60.0, 2), 'auto')
      ON CONFLICT ON CONSTRAINT payroll_one_per_version DO NOTHING
      RETURNING * INTO v_draft;
      IF v_draft.id IS NULL THEN CONTINUE; END IF;
      v_hours := v_draft.worked_hours;
      v_regularizations := v_regularizations + 1;
    END IF;

    -- Config active de l'employé à la date de fin de période.
    SELECT * INTO v_cfg FROM public.employee_salary_config c
    WHERE c.technician_id = v_tech.id AND c.is_active AND c.effective_from <= v_period_end
    ORDER BY c.effective_from DESC LIMIT 1;
    v_rate := v_cfg.hourly_rate_chf; -- NULL si aucune config
    v_suppl := COALESCE(v_cfg.overtime_supplement_pct, 25.00);

    -- Salaire de base (hors régularisation).
    IF NOT v_draft.is_regularization THEN
      IF v_cfg.id IS NULL THEN
        v_base_amount := NULL; v_base_state := 'requires_rule';
        v_base_label := 'Salaire de base — à configurer (aucune config de rémunération)';
      ELSIF v_cfg.pay_type = 'monthly' AND v_cfg.monthly_base_chf IS NOT NULL THEN
        v_base_amount := v_cfg.monthly_base_chf; v_base_state := 'amount_set';
        v_base_label := 'Salaire mensuel de base';
      ELSIF v_cfg.pay_type = 'hourly' AND v_rate IS NOT NULL AND v_hours IS NOT NULL AND v_hours > 0 THEN
        v_base_amount := round(v_hours * v_rate, 2); v_base_state := 'amount_set';
        v_base_label := 'Salaire horaire (' || v_hours || ' h × ' || v_rate || ' CHF/h)';
      ELSE
        v_base_amount := NULL; v_base_state := 'requires_rule';
        v_base_label := CASE WHEN v_cfg.pay_type = 'hourly'
          THEN 'Salaire horaire — heures du mois à saisir/valider'
          ELSE 'Salaire de base — à configurer' END;
      END IF;
      INSERT INTO public.payroll_draft_lines (draft_id, line_type, label, amount_chf, amount_state)
      VALUES (v_draft.id, 'salaire_base', v_base_label, v_base_amount, v_base_state);
    END IF;

    -- Éléments variables valorisés depuis le taux (piquet & amende inchangés).
    INSERT INTO public.payroll_draft_lines
      (draft_id, line_type, salary_item_id, label, minutes, amount_chf, amount_state, source_snapshot)
    SELECT
      q.draft_id, q.item_type, q.item_id, q.label, q.minutes, q.amt,
      CASE WHEN q.amt IS NOT NULL THEN 'amount_set' ELSE 'requires_rule' END,
      q.snapshot
    FROM (
      SELECT
        v_draft.id AS draft_id, si.item_type, si.id AS item_id, si.minutes,
        CASE si.item_type
          WHEN 'piquet' THEN 'Piquet ' || si.period_start || ' → ' || si.period_end || ' (150 CHF/sem. complète)'
          WHEN 'sans_solde' THEN 'Congé sans solde ' || si.period_start || ' → ' || si.period_end || ' (retenue heures × taux)'
          WHEN 'retard' THEN 'Retard du ' || si.item_date || ' (' || si.minutes || ' min, retenue)'
          WHEN 'amende_parc' THEN 'Amende parking du ' || si.item_date || ' (imputabilité à examiner)'
          WHEN 'heures_sup' THEN 'Heures sup. du ' || si.item_date || ' (' || si.minutes || ' min, +' || v_suppl || '%)'
        END AS label,
        CASE si.item_type
          WHEN 'piquet' THEN si.amount_chf
          -- Amende : montant connu (dans le snapshot) mais imputabilité sur salaire
          -- = décision humaine/juridique → reste « à configurer », jamais auto-déduit.
          WHEN 'amende_parc' THEN NULL::numeric
          WHEN 'sans_solde' THEN CASE WHEN v_rate IS NOT NULL AND si.minutes IS NOT NULL THEN round((si.minutes::numeric / 60) * v_rate, 2) END
          WHEN 'retard' THEN CASE WHEN v_rate IS NOT NULL AND si.minutes IS NOT NULL THEN round((si.minutes::numeric / 60) * v_rate, 2) END
          WHEN 'heures_sup' THEN CASE WHEN v_rate IS NOT NULL AND si.minutes IS NOT NULL THEN round((si.minutes::numeric / 60) * v_rate * (1 + v_suppl / 100), 2) END
        END AS amt,
        jsonb_build_object(
          'item_type', si.item_type, 'item_date', si.item_date,
          'period_start', si.period_start, 'period_end', si.period_end,
          'minutes', si.minutes, 'amount_chf', si.amount_chf,
          'hourly_rate_chf', v_rate, 'overtime_supplement_pct', v_suppl,
          'origin', si.origin, 'source_id', si.source_id,
          'compensation_mode', si.compensation_mode, 'payroll_status', si.payroll_status
        ) AS snapshot
      FROM public.salary_items si
      WHERE si.technician_id = v_tech.id
        AND si.status = 'approved'
        AND si.item_date BETWEEN v_period_start AND v_period_end
        AND si.payroll_status NOT IN ('included', 'excluded')
    ) q;

    -- Cotisations / ajouts : brut déterminant = base + heures_sup + piquet résolus.
    IF v_cfg.id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount_chf), 0) INTO v_gross
      FROM public.payroll_draft_lines
      WHERE draft_id = v_draft.id AND line_type IN ('salaire_base', 'heures_sup', 'piquet')
        AND amount_state = 'amount_set';

      INSERT INTO public.payroll_draft_lines
        (draft_id, line_type, component_id, label, amount_chf, amount_state, source_snapshot)
      SELECT
        v_draft.id,
        CASE c.direction WHEN 'deduction' THEN 'cotisation' ELSE 'ajout' END,
        c.id, c.label,
        CASE c.basis WHEN 'fixed' THEN c.amount_chf ELSE round(v_gross * c.pct / 100, 2) END,
        'amount_set',
        jsonb_build_object('basis', c.basis, 'pct', c.pct, 'fixed', c.amount_chf, 'gross', v_gross, 'direction', c.direction)
      FROM public.salary_config_component c
      WHERE c.config_id = v_cfg.id
      ORDER BY c.sort_order;
    END IF;

    -- Réappliquer les overrides secrétaire préservés.
    IF v_overrides IS NOT NULL THEN
      UPDATE public.payroll_draft_lines l
      SET amount_chf = (v_overrides ->> COALESCE(l.salary_item_id::text, l.component_id::text, l.line_type))::numeric,
          amount_state = 'amount_set', overridden = true
      WHERE l.draft_id = v_draft.id
        AND v_overrides ? COALESCE(l.salary_item_id::text, l.component_id::text, l.line_type);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry', p_dry,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'drafts_created', v_created,
    'drafts_refreshed', v_refreshed,
    'regularizations', v_regularizations,
    'would_process', v_would
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- E. RLS : config & composants réservés admin/secrétaire (pas de lecture employé,
--    décision client : diffusion aux salariés hors périmètre).
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_salary_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_config_component ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_config_staff ON public.employee_salary_config;
CREATE POLICY salary_config_staff ON public.employee_salary_config
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

DROP POLICY IF EXISTS salary_config_history_read ON public.employee_salary_config_history;
CREATE POLICY salary_config_history_read ON public.employee_salary_config_history
  FOR SELECT TO authenticated
  USING (public.is_admin_or_secretary());
-- Aucune policy d'écriture : seules les écritures du trigger (SECURITY DEFINER) passent.

DROP POLICY IF EXISTS salary_component_staff ON public.salary_config_component;
CREATE POLICY salary_component_staff ON public.salary_config_component
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

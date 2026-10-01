-- ============================================================================
-- Migration 00040 — LOT A : impôt à la source + modèle de déductions standard
-- ============================================================================
-- Demande recette Richoz (30.09.2026) : la secrétaire doit pouvoir
--   (1) choisir si un employé est soumis à l'impôt à la source (IS) + son taux,
--   (2) charger un modèle de cotisations standard pour ne pas les ressaisir,
--   (3) obtenir des cotisations calculées sur le brut INCLUANT le 13e (comme sur
--       le vrai bulletin Richoz), et des taux fins (0.032 %, 0.547 %, 8.333 %).
--
-- STRICTEMENT ADDITIF, PAIE_FIGEE conservé. Aucun taux légal « en dur » au sens
-- moteur : le modèle est une table de DONNÉES éditable, initialisée avec les
-- lignes réelles du bulletin (taux modifiables par la secrétaire).
-- L'IS réutilise le type de ligne existant 'cotisation' (déjà négatif dans le
-- trigger de net) → AUCUN changement à recompute_payroll_net ni à
-- src/lib/payroll-net.ts. Blast radius minimal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Impôt à la source par employé
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_salary_config
  ADD COLUMN IF NOT EXISTS is_source_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_tax_rate numeric(5,2)
    CHECK (source_tax_rate IS NULL OR (source_tax_rate >= 0 AND source_tax_rate <= 100));

-- Honnêteté : soumis à l'IS ⇒ un taux est renseigné. (Les lignes existantes ont
-- is_source_tax = false par défaut → contrainte satisfaite, aucune rupture.)
ALTER TABLE public.employee_salary_config
  DROP CONSTRAINT IF EXISTS salary_config_source_tax_honest;
ALTER TABLE public.employee_salary_config
  ADD CONSTRAINT salary_config_source_tax_honest
  CHECK (is_source_tax = false OR source_tax_rate IS NOT NULL);

-- ----------------------------------------------------------------------------
-- B. Additions comptant dans le brut déterminant des cotisations
-- ----------------------------------------------------------------------------
-- Sur un vrai bulletin, les cotisations (AVS, AC, IS…) sont calculées sur le
-- brut INCLUANT le 13e salaire. Le brut déterminant historique = salaire_base
-- + heures_sup + piquet (les ajouts en étaient exclus). On permet de marquer un
-- ajout FIXE comme « inclus au brut déterminant » (typiquement le 13e
-- mensualisé) pour que les % tombent juste. Défaut false = comportement inchangé.
ALTER TABLE public.salary_config_component
  ADD COLUMN IF NOT EXISTS included_in_gross boolean NOT NULL DEFAULT false;

-- Taux fins : 0.032 %, 0.547 %, 8.333 %… impossibles en numeric(5,2). Élargir la
-- précision est sans perte (les valeurs à 2 décimales existantes restent valides).
ALTER TABLE public.salary_config_component
  ALTER COLUMN pct TYPE numeric(6,3);

-- ----------------------------------------------------------------------------
-- C. Modèle de cotisations standard (table de données éditable, centrale)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_component_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('deduction', 'addition')),
  basis text NOT NULL CHECK (basis IN ('pct_gross', 'fixed')),
  pct numeric(6,3) CHECK (pct IS NULL OR (pct >= 0 AND pct <= 100)),
  amount_chf numeric(10,2) CHECK (amount_chf IS NULL OR amount_chf >= 0),
  included_in_gross boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_basis_honest CHECK (
    (basis = 'pct_gross' AND pct IS NOT NULL AND amount_chf IS NULL)
    OR (basis = 'fixed' AND amount_chf IS NOT NULL AND pct IS NULL)
  )
);

-- Seed : lignes réelles du bulletin Richoz (septembre 2026). Taux ÉDITABLES
-- ensuite par la secrétaire. Idempotent : ne réinsère pas si le modèle existe.
INSERT INTO public.salary_component_template (label, direction, basis, pct, sort_order)
SELECT * FROM (VALUES
  ('Cotisation AVS/AI/APG',        'deduction', 'pct_gross', 5.300::numeric(6,3), 1),
  ('Assurance maternité (GE)',     'deduction', 'pct_gross', 0.032::numeric(6,3), 2),
  ('Cotisation AC (chômage)',      'deduction', 'pct_gross', 1.100::numeric(6,3), 3),
  ('Cotisation AANP (code A1)',    'deduction', 'pct_gross', 0.800::numeric(6,3), 4),
  ('Cotisation LAA compl. / SIM (code A1)', 'deduction', 'pct_gross', 0.547::numeric(6,3), 5),
  ('Cotisation LPP (prévoyance)',  'deduction', 'pct_gross', 5.500::numeric(6,3), 6)
) AS t(label, direction, basis, pct, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.salary_component_template);

ALTER TABLE public.salary_component_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_template_staff ON public.salary_component_template;
CREATE POLICY salary_template_staff ON public.salary_component_template
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

-- ----------------------------------------------------------------------------
-- D. Génération étendue : brut déterminant + 13e inclus, ligne impôt à la source
-- ----------------------------------------------------------------------------
-- Reprise EXACTE de generate_payroll_drafts (00036) + deux ajouts fléchés :
--   [AJOUT 1] le brut déterminant inclut les additions FIXES marquées
--             included_in_gross (13e mensualisé) ;
--   [AJOUT 2] une ligne 'cotisation' « Impôt à la source » si l'employé y est
--             soumis, calculée sur ce même brut, override préservé (clé unique
--             'cotisation' : l'IS est la seule ligne cotisation sans component_id).
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

      -- [AJOUT 1] + additions FIXES marquées « incluses au brut » (13e mensualisé).
      -- Les % (AVS, AC, IS…) tombent alors juste, comme sur le vrai bulletin.
      v_gross := v_gross + COALESCE((
        SELECT SUM(c.amount_chf)
        FROM public.salary_config_component c
        WHERE c.config_id = v_cfg.id
          AND c.direction = 'addition' AND c.basis = 'fixed' AND c.included_in_gross
      ), 0);

      INSERT INTO public.payroll_draft_lines
        (draft_id, line_type, component_id, label, amount_chf, amount_state, source_snapshot)
      SELECT
        v_draft.id,
        CASE c.direction WHEN 'deduction' THEN 'cotisation' ELSE 'ajout' END,
        c.id, c.label,
        CASE c.basis WHEN 'fixed' THEN c.amount_chf ELSE round(v_gross * c.pct / 100, 2) END,
        'amount_set',
        jsonb_build_object('basis', c.basis, 'pct', c.pct, 'fixed', c.amount_chf, 'gross', v_gross, 'direction', c.direction, 'included_in_gross', c.included_in_gross)
      FROM public.salary_config_component c
      WHERE c.config_id = v_cfg.id
      ORDER BY c.sort_order;

      -- [AJOUT 2] Impôt à la source (frontaliers / soumis) : retenue sur le même
      -- brut déterminant. Ligne 'cotisation' sans component_id → clé d'override
      -- stable et unique ('cotisation'), aucune collision avec les composants.
      IF v_cfg.is_source_tax AND v_cfg.source_tax_rate IS NOT NULL THEN
        INSERT INTO public.payroll_draft_lines
          (draft_id, line_type, component_id, label, amount_chf, amount_state, source_snapshot)
        VALUES (
          v_draft.id, 'cotisation', NULL,
          'Impôt à la source (' || v_cfg.source_tax_rate || ' %)',
          round(v_gross * v_cfg.source_tax_rate / 100, 2), 'amount_set',
          jsonb_build_object('kind', 'source_tax', 'rate', v_cfg.source_tax_rate, 'gross', v_gross)
        );
      END IF;
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

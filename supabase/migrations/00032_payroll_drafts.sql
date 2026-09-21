-- ============================================================================
-- Migration 00032 — LOTS 6B/6C : brouillon de paie et génération du 25
-- ============================================================================
-- CONSTAT (consigné aussi dans docs/RICHOZ-REPRISE-ETAT.md) : le dépôt ne
-- contient AUCUN moteur de paie, aucune fiche existante, aucun salaire de
-- base. Conformément à la passation (« ne pas reconstruire une paie suisse
-- complète depuis zéro », « aucun montant inventé »), le brouillon est une
-- fiche d'éléments variables par salarié/période, avec lignes détaillées et
-- sources, où tout paramètre absent apparaît « à configurer » — jamais un
-- montant inventé ni un faux zéro.
--
-- Fenêtre 6C (INTERPRÉTATION DE TRAVAIL, À CONFIRMER avant activation) :
-- éléments du 26 du mois précédent au 25 du mois courant inclus. La date de
-- référence est passée en paramètre : l'heure de génération et l'heure de
-- clôture de production ne sont pas inventées ici.
--
-- Idempotence : une génération par salarié/période/version ; ON CONFLICT et
-- rafraîchissement des brouillons non validés — deux exécutions ne dupliquent
-- jamais une fiche. Les fiches validées sont figées ; les éléments postérieurs
-- deviennent une RÉGULARISATION explicite (version suivante), pas un
-- déplacement silencieux.
--
-- Clôture : la validation est REFUSÉE tant qu'une ligne « à configurer »
-- subsiste (pas de clôture prétendument complète). À la validation, les
-- éléments à montant résolu passent payroll_status='included' (figés par le
-- trigger 00031) avec référence de fiche.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.users(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated')),
  is_regularization boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES public.users(id), -- NULL = exécution automatisée
  validated_by uuid REFERENCES public.users(id),
  validated_at timestamptz,
  notes text,
  CONSTRAINT payroll_period_order CHECK (period_end >= period_start),
  CONSTRAINT payroll_one_per_version UNIQUE (technician_id, period_start, period_end, version)
);

CREATE TABLE IF NOT EXISTS public.payroll_draft_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.payroll_drafts(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('salaire_base', 'sans_solde', 'retard', 'amende_parc', 'heures_sup', 'piquet')),
  salary_item_id uuid, -- source (salary_items), NULL pour le salaire de base
  label text NOT NULL,
  minutes integer,
  amount_chf numeric(10,2),
  amount_state text NOT NULL CHECK (amount_state IN ('amount_set', 'requires_rule')),
  source_snapshot jsonb, -- valeurs sources utilisées, pour justifier le calcul
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_line_amount_honest CHECK (
    (amount_state = 'amount_set' AND amount_chf IS NOT NULL)
    OR (amount_state = 'requires_rule' AND amount_chf IS NULL) -- jamais un faux zéro
  )
);

CREATE INDEX IF NOT EXISTS idx_payroll_drafts_period ON public.payroll_drafts(period_start, period_end, technician_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_draft ON public.payroll_draft_lines(draft_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_item ON public.payroll_draft_lines(salary_item_id) WHERE salary_item_id IS NOT NULL;

-- Fiches validées figées : ni modification (hors passage draft→validated), ni suppression.
CREATE OR REPLACE FUNCTION public.protect_validated_payroll()
RETURNS TRIGGER AS $$
DECLARE unresolved integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'validated' THEN
      RAISE EXCEPTION 'PAIE_FIGEE: fiche validée, suppression interdite (utiliser une régularisation).';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'validated' THEN
    RAISE EXCEPTION 'PAIE_FIGEE: fiche validée, modification interdite (utiliser une régularisation).';
  END IF;
  IF NEW.status = 'validated' AND OLD.status = 'draft' THEN
    SELECT count(*) INTO unresolved
    FROM public.payroll_draft_lines l
    WHERE l.draft_id = NEW.id AND l.amount_state = 'requires_rule';
    IF unresolved > 0 THEN
      RAISE EXCEPTION 'VALIDATION_INCOMPLETE: % ligne(s) « à configurer » non résolue(s) ; clôture refusée.', unresolved;
    END IF;
    NEW.validated_at := COALESCE(NEW.validated_at, now());
    -- Les éléments intégrés sont figés et référencés (audit lot 6A).
    UPDATE public.salary_items si
    SET payroll_status = 'included', payroll_reference = NEW.id, payroll_processed_at = now()
    WHERE si.id IN (
      SELECT l.salary_item_id FROM public.payroll_draft_lines l
      WHERE l.draft_id = NEW.id AND l.salary_item_id IS NOT NULL AND l.amount_state = 'amount_set'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_payroll_drafts_protect ON public.payroll_drafts;
CREATE TRIGGER tr_payroll_drafts_protect
  BEFORE UPDATE OR DELETE ON public.payroll_drafts
  FOR EACH ROW EXECUTE FUNCTION public.protect_validated_payroll();

CREATE OR REPLACE FUNCTION public.protect_validated_payroll_lines()
RETURNS TRIGGER AS $$
DECLARE draft_status text;
BEGIN
  SELECT status INTO draft_status FROM public.payroll_drafts WHERE id = COALESCE(NEW.draft_id, OLD.draft_id);
  IF draft_status = 'validated' THEN
    RAISE EXCEPTION 'PAIE_FIGEE: lignes d''une fiche validée non modifiables.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_payroll_lines_protect ON public.payroll_draft_lines;
CREATE TRIGGER tr_payroll_lines_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_draft_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_validated_payroll_lines();

-- ============================================================================
-- Génération idempotente. p_reference = date de référence (en production, le
-- 25 du mois ; la valeur exacte vient de l'appelant, jamais inventée ici).
-- p_dry = true (défaut) : simulation, aucune écriture.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_payroll_drafts(p_reference date, p_dry boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE
  v_period_end date;
  v_period_start date;
  v_tech record;
  v_draft public.payroll_drafts%ROWTYPE;
  v_latest public.payroll_drafts%ROWTYPE;
  v_created integer := 0;
  v_refreshed integer := 0;
  v_regularizations integer := 0;
  v_lines integer := 0;
  v_would integer := 0;
BEGIN
  IF NOT (public.is_admin_or_secretary() OR auth.jwt() ->> 'role' = 'service_role') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: génération réservée à l''administration.';
  END IF;

  -- Fenêtre 26 → 25 (interprétation de travail à confirmer).
  v_period_end := make_date(EXTRACT(YEAR FROM p_reference)::int, EXTRACT(MONTH FROM p_reference)::int, 25);
  v_period_start := (v_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date; -- le 26 du mois précédent

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
    SELECT * INTO v_latest FROM public.payroll_drafts d
    WHERE d.technician_id = v_tech.id AND d.period_start = v_period_start AND d.period_end = v_period_end
    ORDER BY d.version DESC LIMIT 1;

    IF v_latest.id IS NULL THEN
      -- Nouvelle fiche v1
      IF p_dry THEN
        v_would := v_would + 1;
        CONTINUE;
      END IF;
      INSERT INTO public.payroll_drafts (technician_id, period_start, period_end, version, generated_by)
      VALUES (v_tech.id, v_period_start, v_period_end, 1, auth.uid())
      ON CONFLICT ON CONSTRAINT payroll_one_per_version DO NOTHING
      RETURNING * INTO v_draft;
      IF v_draft.id IS NULL THEN CONTINUE; END IF; -- exécution concurrente : rien à refaire
      v_created := v_created + 1;
    ELSIF v_latest.status = 'draft' THEN
      -- Rafraîchissement : les événements arrivés après la génération (y
      -- compris le 25 même) ne sont pas perdus.
      IF p_dry THEN
        v_would := v_would + 1;
        CONTINUE;
      END IF;
      v_draft := v_latest;
      DELETE FROM public.payroll_draft_lines WHERE draft_id = v_draft.id;
      v_refreshed := v_refreshed + 1;
    ELSE
      -- Fiche validée : les éléments approuvés non encore intégrés deviennent
      -- une régularisation explicite (version suivante), jamais une retouche.
      IF NOT EXISTS (
        SELECT 1 FROM public.salary_items si
        WHERE si.technician_id = v_tech.id AND si.status = 'approved'
          AND si.item_date BETWEEN v_period_start AND v_period_end
          AND si.payroll_status NOT IN ('included', 'excluded')
      ) THEN
        CONTINUE;
      END IF;
      IF p_dry THEN
        v_would := v_would + 1;
        CONTINUE;
      END IF;
      INSERT INTO public.payroll_drafts (technician_id, period_start, period_end, version, generated_by, is_regularization, notes)
      VALUES (v_tech.id, v_period_start, v_period_end, v_latest.version + 1, auth.uid(), true,
              'Régularisation : éléments postérieurs à la clôture de la version ' || v_latest.version)
      ON CONFLICT ON CONSTRAINT payroll_one_per_version DO NOTHING
      RETURNING * INTO v_draft;
      IF v_draft.id IS NULL THEN CONTINUE; END IF;
      v_regularizations := v_regularizations + 1;
    END IF;

    -- Salaire de base : AUCUNE donnée salariale dans le logiciel → à configurer.
    -- (Uniquement sur la fiche principale, pas sur une régularisation.)
    IF NOT v_draft.is_regularization THEN
      INSERT INTO public.payroll_draft_lines (draft_id, line_type, label, amount_state)
      VALUES (v_draft.id, 'salaire_base',
              'Salaire de base — à configurer (aucune donnée salariale validée dans le logiciel)',
              'requires_rule');
      v_lines := v_lines + 1;
    END IF;

    -- Éléments variables admissibles : approuvés, dans la fenêtre, pas déjà
    -- intégrés/exclus. Montant repris UNIQUEMENT si la règle est validée
    -- (piquet) ; sinon ligne « à configurer » avec les données sources.
    INSERT INTO public.payroll_draft_lines
      (draft_id, line_type, salary_item_id, label, minutes, amount_chf, amount_state, source_snapshot)
    SELECT
      v_draft.id,
      si.item_type,
      si.id,
      CASE si.item_type
        WHEN 'piquet' THEN 'Piquet ' || si.period_start || ' → ' || si.period_end || ' (150 CHF/semaine complète)'
        WHEN 'sans_solde' THEN 'Congé sans solde ' || si.period_start || ' → ' || si.period_end || ' — tarif à configurer'
        WHEN 'retard' THEN 'Retard du ' || si.item_date || ' (' || si.minutes || ' min) — traitement à configurer'
        WHEN 'amende_parc' THEN 'Amende parking du ' || si.item_date || ' — imputabilité à examiner'
        WHEN 'heures_sup' THEN 'Heures sup. du ' || si.item_date || ' (' || si.minutes || ' min) — taux à configurer'
      END,
      si.minutes,
      CASE WHEN si.payroll_status = 'not_processed' THEN si.amount_chf ELSE NULL END,
      CASE WHEN si.payroll_status = 'not_processed' AND si.amount_chf IS NOT NULL THEN 'amount_set' ELSE 'requires_rule' END,
      jsonb_build_object(
        'item_type', si.item_type, 'item_date', si.item_date,
        'period_start', si.period_start, 'period_end', si.period_end,
        'minutes', si.minutes, 'amount_chf', si.amount_chf,
        'origin', si.origin, 'source_id', si.source_id,
        'compensation_mode', si.compensation_mode, 'payroll_status', si.payroll_status
      )
    FROM public.salary_items si
    WHERE si.technician_id = v_tech.id
      AND si.status = 'approved'
      AND si.item_date BETWEEN v_period_start AND v_period_end
      AND si.payroll_status NOT IN ('included', 'excluded');
    GET DIAGNOSTICS v_lines = ROW_COUNT;
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

-- RLS : consultation et gestion par admin/secrétaire uniquement (la diffusion
-- aux salariés est une décision client non prise).
ALTER TABLE public.payroll_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_draft_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_drafts_staff ON public.payroll_drafts;
CREATE POLICY payroll_drafts_staff ON public.payroll_drafts
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

DROP POLICY IF EXISTS payroll_lines_staff ON public.payroll_draft_lines;
CREATE POLICY payroll_lines_staff ON public.payroll_draft_lines
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

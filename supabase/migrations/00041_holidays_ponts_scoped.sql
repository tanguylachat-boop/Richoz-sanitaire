-- ============================================================================
-- Migration 00041 — LOT B : jours fériés + PONTS avec techniciens concernés
-- ============================================================================
-- Demande recette Richoz (30.09.2026) : depuis le calendrier, la secrétaire doit
-- pouvoir ajouter un férié OU un pont, choisir les techniciens concernés, et
-- l'effet paie (payé / non payé / sur congés).
--
-- STRICTEMENT ADDITIF. AUCUN changement au moteur de paie, aux salary_items, ni
-- au trigger de net. L'effet paie d'un pont est réalisé par les systèmes DÉJÀ
-- TESTÉS (côté application) :
--   * « non payé » → congé leave_type='sans_solde' approuvé → autosync 00035 →
--     salary_item (pending) → retenue à la génération de paie.
--   * « sur congés » → congé leave_type='conge' approuvé → décompté du solde.
--   * « payé »      → simple marqueur calendrier (mensualisés = déjà payés).
-- Ici on n'ajoute QUE : la nature (férié/pont), l'effet (traçabilité), et le
-- périmètre (techniciens concernés — vide = tout le monde).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. public_holidays : clé de substitution + nature + effet + auteur
-- ----------------------------------------------------------------------------
-- La table avait holiday_date en PK (un seul férié cantonal par date). Un pont
-- peut viser certains techniciens et coexister → on passe la PK sur un id.
ALTER TABLE public.public_holidays
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ferie'
    CHECK (kind IN ('ferie', 'pont')),
  ADD COLUMN IF NOT EXISTS pay_effect text NOT NULL DEFAULT 'paid'
    CHECK (pay_effect IN ('paid', 'unpaid', 'leave')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

-- Bascule de la clé primaire holiday_date → id (les fériés seedés ont chacun
-- reçu un id distinct via le DEFAULT volatile ci-dessus).
ALTER TABLE public.public_holidays DROP CONSTRAINT IF EXISTS public_holidays_pkey;
ALTER TABLE public.public_holidays ADD CONSTRAINT public_holidays_pkey PRIMARY KEY (id);

-- On conserve l'unicité d'un FÉRIÉ cantonal par date (pas de doublon de férié) ;
-- les ponts, eux, ne sont pas contraints (plusieurs ponts/dates possibles).
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_holidays_ferie_date
  ON public.public_holidays(holiday_date) WHERE kind = 'ferie';

CREATE INDEX IF NOT EXISTS idx_public_holidays_date
  ON public.public_holidays(holiday_date);

-- ----------------------------------------------------------------------------
-- B. Techniciens concernés par un férié/pont (vide = tout le monde)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_holiday_technicians (
  holiday_id uuid NOT NULL REFERENCES public.public_holidays(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (holiday_id, technician_id)
);

CREATE INDEX IF NOT EXISTS idx_pht_technician
  ON public.public_holiday_technicians(technician_id);

ALTER TABLE public.public_holiday_technicians ENABLE ROW LEVEL SECURITY;

-- Lecture par tout le personnel connecté (affichage calendrier).
DROP POLICY IF EXISTS pht_read ON public.public_holiday_technicians;
CREATE POLICY pht_read ON public.public_holiday_technicians
  FOR SELECT TO authenticated USING (true);

-- Gestion réservée admin + secrétaire.
DROP POLICY IF EXISTS pht_staff ON public.public_holiday_technicians;
CREATE POLICY pht_staff ON public.public_holiday_technicians
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

-- Note : les policies existantes de public_holidays (lecture tous, écriture
-- staff via is_admin_or_secretary) restent valables — inchangées ici.

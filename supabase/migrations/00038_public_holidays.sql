-- ============================================================================
-- Migration 00038 — Jours fériés (canton de Genève) — jours payés
-- ============================================================================
-- Affichés dans le calendrier ; marqués « payés ». L'incidence paie précise
-- (heures payées d'un férié pour un employé HORAIRE) dépend d'une règle client
-- non encore fournie (aucune heure contractuelle dans le système) — non
-- calculée ici pour ne rien inventer ; un mensualisé est payé de fait.
-- Table de référence : lecture par tous les authentifiés, écriture staff.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.public_holidays (
  holiday_date date PRIMARY KEY,
  label text NOT NULL,
  canton text NOT NULL DEFAULT 'GE',
  is_paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jours fériés genevois 2027 (fournis par le client).
INSERT INTO public.public_holidays (holiday_date, label) VALUES
  ('2027-01-01', 'Nouvel An'),
  ('2027-03-26', 'Vendredi-Saint'),
  ('2027-03-29', 'Lundi de Pâques'),
  ('2027-05-06', 'Jeudi de l''Ascension'),
  ('2027-05-17', 'Lundi de Pentecôte'),
  ('2027-08-01', 'Fête nationale'),
  ('2027-09-09', 'Jeûne genevois'),
  ('2027-12-25', 'Noël'),
  ('2027-12-31', 'Restauration de la République')
ON CONFLICT (holiday_date) DO NOTHING;

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- Référence non sensible : visible par tout le personnel connecté (calendrier).
DROP POLICY IF EXISTS public_holidays_read ON public.public_holidays;
CREATE POLICY public_holidays_read ON public.public_holidays
  FOR SELECT TO authenticated USING (true);

-- Gestion réservée admin + secrétaire (ajout d'années futures, corrections).
DROP POLICY IF EXISTS public_holidays_staff ON public.public_holidays;
CREATE POLICY public_holidays_staff ON public.public_holidays
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

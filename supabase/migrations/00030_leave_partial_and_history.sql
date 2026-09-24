-- ============================================================================
-- Migration 00030 — LOT 5 : congés modifiables (heures), historique, garde-fous
-- ============================================================================
-- 1) Absences partielles : start_time/end_time, uniquement lorsque le congé
--    tient sur un seul jour (start_date = end_date). Un congé multi-jours
--    reste en journées complètes : le dépôt ne contient aucun planning
--    contractuel permettant de calculer une frontière d'heure sur plusieurs
--    jours, et aucune règle n'est inventée ici.
-- 2) Historique inviolable des changements (leave_request_history), alimenté
--    par trigger SECURITY DEFINER. Aucune écriture client possible ; lecture
--    admin/secrétaire + technicien concerné. L'historique survit à la
--    suppression du congé (pas de FK cascade sur leave_request_id).
-- 3) Refus des chevauchements de même type (pending/approved) pour le même
--    technicien : empêche le double décompte des compteurs.
-- 4) Alignement RLS : le formulaire technicien existant enregistre les
--    déclarations maladie/accident auto-validées (status 'approved',
--    reviewed_by = lui-même). La policy `leave_request` (status 'pending'
--    uniquement) bloquait ce comportement applicatif : une policy dédiée et
--    strictement limitée à ces deux types est ajoutée. Aucun autre droit
--    n'est élargi.
-- Aucune règle salariale ici : la consommation paie des congés sans solde
-- reste préparée (type + durée calculable) sans tarif ni retenue.
-- ============================================================================

-- 1) Absences partielles ------------------------------------------------------

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN public.leave_requests.start_time IS
  'Heure de début (absence partielle). Renseignée uniquement si start_date = end_date.';
COMMENT ON COLUMN public.leave_requests.end_time IS
  'Heure de fin (absence partielle). Renseignée uniquement si start_date = end_date.';

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_partial_same_day;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_partial_same_day CHECK (
  (start_time IS NULL AND end_time IS NULL)
  OR (
    start_date = end_date
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND end_time > start_time
  )
);

-- 2) Historique des changements ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.leave_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX IF NOT EXISTS idx_leave_history_request
  ON public.leave_request_history(leave_request_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_history_technician
  ON public.leave_request_history(technician_id, changed_at DESC);

ALTER TABLE public.leave_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_history_read ON public.leave_request_history;
CREATE POLICY leave_history_read ON public.leave_request_history
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin_or_secretary());
-- Aucune policy INSERT/UPDATE/DELETE : seules les écritures du trigger
-- (SECURITY DEFINER, propriétaire de la table) sont possibles.

CREATE OR REPLACE FUNCTION public.log_leave_request_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.leave_request_history
      (leave_request_id, technician_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.technician_id, 'create', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Ne journalise pas les écritures sans changement effectif.
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.leave_request_history
        (leave_request_id, technician_id, action, changed_by, old_values, new_values)
      VALUES (NEW.id, NEW.technician_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.leave_request_history
      (leave_request_id, technician_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.technician_id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_leave_requests_history ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_history
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_leave_request_change();

-- 3) Anti-chevauchement (même technicien, même type, pending/approved) --------

CREATE OR REPLACE FUNCTION public.prevent_leave_overlap()
RETURNS TRIGGER AS $$
DECLARE conflict_id uuid;
BEGIN
  IF NEW.status IN ('pending', 'approved') THEN
    SELECT lr.id INTO conflict_id
    FROM public.leave_requests lr
    WHERE lr.technician_id = NEW.technician_id
      AND lr.id <> NEW.id
      AND lr.leave_type = NEW.leave_type
      AND lr.status IN ('pending', 'approved')
      AND lr.start_date <= NEW.end_date
      AND lr.end_date >= NEW.start_date
    LIMIT 1;
    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'CHEVAUCHEMENT_CONGE: un congé de même type existe déjà sur cette période (%).', conflict_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_leave_requests_overlap ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_overlap
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_leave_overlap();

CREATE INDEX IF NOT EXISTS idx_leave_requests_tech_period
  ON public.leave_requests(technician_id, start_date, end_date);

-- 4) Déclarations maladie/accident auto-validées (comportement app existant) --

DROP POLICY IF EXISTS leave_self_declared ON public.leave_requests;
CREATE POLICY leave_self_declared ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    technician_id = auth.uid()
    AND status = 'approved'
    AND reviewed_by = auth.uid()
    AND leave_type IN ('maladie', 'accident')
  );

-- ============================================================================
-- Migration 00034 — LOT 7 : géolocalisation des dépanneurs (MVP)
-- ============================================================================
-- Périmètre volontairement minimal (proportionnalité PFPDT) :
-- * UNE seule ligne par technicien : la dernière position pendant un partage
--   actif. AUCUN historique de trajets, aucun score, aucune surveillance
--   dissimulée — chaque mise à jour écrase la précédente.
-- * Politique de conservation : à l'arrêt du partage, les coordonnées sont
--   EFFACÉES (contrainte en base) ; il ne reste que l'état « inactif ».
-- * Partage explicite par le technicien lui-même (RLS : il n'écrit que sa
--   propre ligne). Lecture réservée à l'administration/secrétariat.
-- * L'activation réelle chez le client reste conditionnée à l'information
--   préalable des salariés (voir bilan LOT 7) ; l'interface est livrée
--   désactivée par défaut (drapeau d'environnement).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.technician_locations (
  technician_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_sharing boolean NOT NULL DEFAULT false,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  recorded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Conservation minimale : aucune coordonnée hors partage actif.
  CONSTRAINT location_only_while_sharing CHECK (
    is_sharing OR (latitude IS NULL AND longitude IS NULL AND accuracy_m IS NULL AND recorded_at IS NULL)
  ),
  CONSTRAINT location_complete CHECK (
    (latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

CREATE OR REPLACE FUNCTION public.set_technician_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS technician_locations_updated_at ON public.technician_locations;
CREATE TRIGGER technician_locations_updated_at BEFORE UPDATE ON public.technician_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_technician_locations_updated_at();

ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

-- Le technicien gère UNIQUEMENT sa propre ligne (partage explicite).
DROP POLICY IF EXISTS technician_locations_self ON public.technician_locations;
CREATE POLICY technician_locations_self ON public.technician_locations
  FOR ALL TO authenticated
  USING (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());

-- Lecture par l'administration/secrétariat (organisation des interventions).
DROP POLICY IF EXISTS technician_locations_staff_read ON public.technician_locations;
CREATE POLICY technician_locations_staff_read ON public.technician_locations
  FOR SELECT TO authenticated
  USING (public.is_admin_or_secretary());

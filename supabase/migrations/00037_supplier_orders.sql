-- ============================================================================
-- Migration 00037 — Bons de commande fournisseur (côté technicien / chantier)
-- ============================================================================
-- Le technicien enregistre ce qu'il prend chez le fournisseur : nom du
-- fournisseur, note libre, et photo(s) du bon/ticket. Rattaché à une
-- intervention (couvre dépannage ET chantier). La secrétaire lit pour la
-- facturation et coche « traité ». Réutilise le bucket 'photos' existant
-- (chemins {uid}/supplier-orders/... — autorisés par report_photo_scope, 00028,
-- car 2e segment <> 'reports'). Sécurité calquée sur les rapports (lot 6).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.users(id),
  supplier text,
  note text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_processed boolean NOT NULL DEFAULT false,
  processed_by uuid REFERENCES public.users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_intervention
  ON public.supplier_orders(intervention_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_tech
  ON public.supplier_orders(technician_id, created_at DESC);

-- updated_at maintenu par une fonction dédiée (search_path figé).
CREATE OR REPLACE FUNCTION public.set_supplier_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_supplier_orders_updated_at ON public.supplier_orders;
CREATE TRIGGER tr_supplier_orders_updated_at
  BEFORE UPDATE ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_orders_updated_at();

-- ----------------------------------------------------------------------------
-- RLS : technicien = ses propres BC pour SES interventions ; staff = tout.
-- Un BC « traité » (is_processed) est figé côté technicien (correction = staff).
-- ----------------------------------------------------------------------------
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

-- Staff (admin + secrétaire) : accès complet.
DROP POLICY IF EXISTS supplier_orders_staff ON public.supplier_orders;
CREATE POLICY supplier_orders_staff ON public.supplier_orders
  FOR ALL TO authenticated
  USING (public.is_admin_or_secretary()) WITH CHECK (public.is_admin_or_secretary());

-- Technicien : lit ses propres BC.
DROP POLICY IF EXISTS supplier_orders_tech_read ON public.supplier_orders;
CREATE POLICY supplier_orders_tech_read ON public.supplier_orders
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid());

-- Technicien : crée un BC pour une intervention QUI LUI EST ASSIGNÉE, non traité.
DROP POLICY IF EXISTS supplier_orders_tech_insert ON public.supplier_orders;
CREATE POLICY supplier_orders_tech_insert ON public.supplier_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    technician_id = auth.uid() AND is_processed = false
    AND EXISTS (SELECT 1 FROM public.interventions i
                WHERE i.id = intervention_id AND i.technician_id = auth.uid())
  );

-- Technicien : modifie/supprime ses BC tant qu'ils ne sont pas traités.
DROP POLICY IF EXISTS supplier_orders_tech_update ON public.supplier_orders;
CREATE POLICY supplier_orders_tech_update ON public.supplier_orders
  FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() AND is_processed = false)
  WITH CHECK (technician_id = auth.uid() AND is_processed = false);

DROP POLICY IF EXISTS supplier_orders_tech_delete ON public.supplier_orders;
CREATE POLICY supplier_orders_tech_delete ON public.supplier_orders
  FOR DELETE TO authenticated
  USING (technician_id = auth.uid() AND is_processed = false);

-- Restrictif : aucun compte inactif ne touche les BC (calque des rapports).
DROP POLICY IF EXISTS supplier_orders_active ON public.supplier_orders;
CREATE POLICY supplier_orders_active ON public.supplier_orders
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active = true));

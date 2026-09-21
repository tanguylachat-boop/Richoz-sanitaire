-- ============================================================================
-- Migration 00033 — LOT 4 : identifiant source stable pour l'import Bexio
-- ============================================================================
-- L'export Excel Bexio porte un numéro de contact stable (« Nr. »). Le
-- conserver permet un réimport sans doublon et sans fusionner deux personnes
-- sur un simple nom partagé. Colonne nullable : les contacts saisis à la main
-- n'en ont pas.
-- ============================================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bexio_nr text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_bexio_nr
  ON public.clients(bexio_nr) WHERE bexio_nr IS NOT NULL;

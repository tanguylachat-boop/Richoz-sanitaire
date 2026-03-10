-- =====================================================
-- Add parent_quote_id for counter-quotes (contre-devis)
-- =====================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

COMMENT ON COLUMN quotes.parent_quote_id IS 'Référence au devis parent pour les contre-devis';

CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);

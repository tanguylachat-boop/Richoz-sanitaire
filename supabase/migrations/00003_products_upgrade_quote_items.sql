-- =====================================================
-- Migration: Products multi-supplier upgrade + quote_items table
-- Adds: public_price, keywords to products
-- Creates: quote_items relational table
-- Enables: pg_trgm for fuzzy search (AI vocal)
-- =====================================================

-- 1. Enable pg_trgm extension for fuzzy/trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- 2. PRODUCTS TABLE - Add new columns
-- =====================================================

-- Public/catalogue price (prix catalogue fournisseur)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'public_price'
    ) THEN
        ALTER TABLE products ADD COLUMN public_price DECIMAL(10,2);
    END IF;
END $$;

COMMENT ON COLUMN products.public_price IS 'Prix catalogue fournisseur (prix public)';

-- Keywords for AI voice search
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'keywords'
    ) THEN
        ALTER TABLE products ADD COLUMN keywords TEXT;
    END IF;
END $$;

COMMENT ON COLUMN products.keywords IS 'Mots-clés pour recherche vocale IA (ex: "robinet eau chaude mitigeur")';

-- Rename existing columns for clarity (add comments)
COMMENT ON COLUMN products.supplier IS 'Nom du fournisseur (ex: Sabag, Reuter, Grohe)';
COMMENT ON COLUMN products.supplier_reference IS 'Référence article chez le fournisseur';
COMMENT ON COLUMN products.cost_price IS 'Prix d''achat (notre coût)';
COMMENT ON COLUMN products.price IS 'Prix de vente (ce qu''on facture au client)';

-- =====================================================
-- 3. PRODUCTS - Trigram indexes for fuzzy search
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_keywords_trgm ON products USING gin (keywords gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_supplier_trgm ON products USING gin (supplier gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_supplier_ref ON products(supplier_reference);

-- =====================================================
-- 4. QUOTE_ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    -- Item details
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quote_items IS 'Lignes de devis liées aux produits - Quote line items';
COMMENT ON COLUMN quote_items.product_id IS 'Lien optionnel vers le catalogue produits';
COMMENT ON COLUMN quote_items.description IS 'Description de la ligne (peut différer du produit catalogue)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_items(product_id);

-- =====================================================
-- 5. RLS for quote_items
-- =====================================================

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_items_select_authenticated" ON quote_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "quote_items_manage_admin" ON quote_items
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "quote_items_service_role" ON quote_items
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 6. Fuzzy search function for products (used by n8n AI)
-- =====================================================

CREATE OR REPLACE FUNCTION search_products_fuzzy(search_term TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    supplier TEXT,
    supplier_reference TEXT,
    price DECIMAL,
    cost_price DECIMAL,
    public_price DECIMAL,
    category TEXT,
    keywords TEXT,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.description,
        p.supplier,
        p.supplier_reference,
        p.price,
        p.cost_price,
        p.public_price,
        p.category,
        p.keywords,
        GREATEST(
            similarity(p.name, search_term),
            similarity(COALESCE(p.keywords, ''), search_term),
            similarity(COALESCE(p.supplier, ''), search_term),
            similarity(COALESCE(p.description, ''), search_term)
        ) AS similarity_score
    FROM products p
    WHERE p.is_active = true
      AND (
        p.name % search_term
        OR COALESCE(p.keywords, '') % search_term
        OR COALESCE(p.supplier, '') % search_term
        OR COALESCE(p.description, '') % search_term
        OR p.name ILIKE '%' || search_term || '%'
        OR COALESCE(p.keywords, '') ILIKE '%' || search_term || '%'
      )
    ORDER BY similarity_score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION search_products_fuzzy IS 'Recherche floue de produits pour l''IA vocale - utilise pg_trgm';

-- =====================================================
-- 7. Update seed data with keywords
-- =====================================================

UPDATE products SET keywords = 'main oeuvre heure travail technicien' WHERE name = 'Main d''oeuvre (1h)';
UPDATE products SET keywords = 'déplacement transport véhicule' WHERE name = 'Déplacement';
UPDATE products SET keywords = 'déplacement urgence transport urgent' WHERE name = 'Déplacement urgence';
UPDATE products SET keywords = 'majoration nuit weekend supplément extra' WHERE name = 'Majoration nuit/weekend';
UPDATE products SET keywords = 'joint standard caoutchouc étanchéité' WHERE name = 'Joint standard';
UPDATE products SET keywords = 'joint fibre raccord étanchéité' WHERE name = 'Joint fibre';
UPDATE products SET keywords = 'flexible douche pommeau tuyau 150' WHERE name = 'Flexible douche 1.5m';
UPDATE products SET keywords = 'flexible douche pommeau tuyau 200 long' WHERE name = 'Flexible douche 2m';
UPDATE products SET keywords = 'robinet mitigeur lavabo vasque salle bain' WHERE name = 'Robinet mitigeur lavabo';
UPDATE products SET keywords = 'robinet mitigeur cuisine évier bec haut' WHERE name = 'Robinet mitigeur cuisine';
UPDATE products SET keywords = 'mécanisme chasse eau WC toilette réservoir' WHERE name = 'Mécanisme chasse d''eau';
UPDATE products SET keywords = 'flotteur WC toilette réservoir robinet' WHERE name = 'Flotteur WC';
UPDATE products SET keywords = 'siphon lavabo PVC chromé évacuation' WHERE name = 'Siphon lavabo';
UPDATE products SET keywords = 'thermostat radiateur tête thermostatique chauffage' WHERE name = 'Thermostat radiateur';
UPDATE products SET keywords = 'vanne radiateur corps chauffage' WHERE name = 'Vanne radiateur';
UPDATE products SET keywords = 'purgeur automatique air radiateur chauffage' WHERE name = 'Purgeur automatique';
UPDATE products SET keywords = 'circulateur pompe circulation chauffage' WHERE name = 'Circulateur chauffage';
UPDATE products SET keywords = 'vase expansion sanitaire pression membrane' WHERE name = 'Vase expansion 8L';

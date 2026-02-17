-- =====================================================
-- RICHOZ SANITAIRE DATABASE SCHEMA
-- Supabase PostgreSQL with RLS, Realtime, and Storage
-- Code: English | UI Labels: French
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUM TYPES
-- =====================================================

CREATE TYPE user_role AS ENUM ('admin', 'secretary', 'technician');
CREATE TYPE intervention_status AS ENUM ('nouveau', 'planifie', 'en_cours', 'termine', 'facture', 'annule');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending_validation', 'validated', 'sent', 'paid', 'cancelled');
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
CREATE TYPE report_status AS ENUM ('draft', 'submitted', 'validated', 'rejected');

-- =====================================================
-- TABLES
-- =====================================================

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'technician',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Staff accounts - Comptes utilisateurs';
COMMENT ON COLUMN users.role IS 'admin=Administrateur, secretary=Secrétariat, technician=Technicien';

-- 2. REGIES TABLE (Property Management Companies)
CREATE TABLE regies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    keyword TEXT UNIQUE NOT NULL,
    email_contact TEXT,
    phone TEXT,
    address TEXT,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    billing_email TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE regies IS 'Property management companies - Régies immobilières';
COMMENT ON COLUMN regies.keyword IS 'Keyword for email detection - Mot-clé pour détection email (ex: FONCIA, NAEF)';

-- 3. INTERVENTIONS TABLE
CREATE TABLE interventions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    regie_id UUID REFERENCES regies(id) ON DELETE SET NULL,
    technician_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Status tracking
    status intervention_status NOT NULL DEFAULT 'nouveau',

    -- Core info
    title TEXT NOT NULL,
    description TEXT,
    address TEXT NOT NULL,

    -- Scheduling
    date_planned TIMESTAMPTZ,
    date_completed TIMESTAMPTZ,
    estimated_duration_minutes INTEGER DEFAULT 60,

    -- Calendar sync
    google_calendar_event_id TEXT UNIQUE,

    -- Client info (JSONB for flexibility)
    client_info JSONB DEFAULT '{}',
    -- Example: {"name": "M. Dupont", "phone": "+41 79 123 45 67", "apartment": "3A", "access_code": "1234"}

    -- Source tracking
    source_email_id TEXT,
    source_type TEXT DEFAULT 'manual',

    -- Metadata
    priority INTEGER DEFAULT 0,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE interventions IS 'Work orders - Interventions/Ordres de travail';
COMMENT ON COLUMN interventions.status IS 'nouveau=Nouveau, planifie=Planifié, en_cours=En cours, termine=Terminé, facture=Facturé, annule=Annulé';
COMMENT ON COLUMN interventions.priority IS '0=Normal, 1=Urgent, 2=Urgence absolue';
COMMENT ON COLUMN interventions.source_type IS 'email, calendar, manual, phone';

-- 4. REPORTS TABLE (Technician Field Reports)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Report content
    text_content TEXT,
    vocal_url TEXT,
    vocal_transcription TEXT,

    -- Photos (array of storage URLs)
    photos JSONB DEFAULT '[]',

    -- Checklist
    checklist JSONB DEFAULT '[]',

    -- Billing classification
    is_billable BOOLEAN DEFAULT true,
    billable_reason TEXT,

    -- Work details
    work_duration_minutes INTEGER,
    materials_used JSONB DEFAULT '[]',

    -- Status
    status report_status DEFAULT 'draft',
    validated_at TIMESTAMPTZ,
    validated_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE reports IS 'Technician field reports - Rapports de terrain des techniciens';
COMMENT ON COLUMN reports.status IS 'draft=Brouillon, submitted=Soumis, validated=Validé, rejected=Rejeté';

-- 5. INVOICES TABLE
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,

    -- Invoice number (auto-generated)
    invoice_number TEXT UNIQUE,

    -- PDF and QR
    pdf_url TEXT,
    qr_reference TEXT,
    qr_iban TEXT,

    -- Amounts (in CHF)
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    vat_rate DECIMAL(5,2) DEFAULT 7.7,
    vat_amount DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,

    -- Line items
    line_items JSONB NOT NULL,

    -- Status tracking
    status invoice_status DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    -- External integrations
    tayo_id TEXT,
    tayo_sync_status TEXT,
    tayo_synced_at TIMESTAMPTZ,

    -- Payment tracking
    payment_method TEXT,
    payment_reference TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE invoices IS 'Generated invoices - Factures générées';
COMMENT ON COLUMN invoices.status IS 'draft=Brouillon, pending_validation=En attente, validated=Validée, sent=Envoyée, paid=Payée, cancelled=Annulée';

-- 6. QUOTES TABLE (Devis)
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Client info
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_address TEXT,

    -- Optional regie link
    regie_id UUID REFERENCES regies(id) ON DELETE SET NULL,

    -- Quote details
    quote_number TEXT UNIQUE,
    title TEXT,
    description TEXT,

    -- Line items
    items JSONB NOT NULL,

    -- Amounts
    subtotal DECIMAL(10,2) NOT NULL,
    discount_regie BOOLEAN DEFAULT false,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    vat_rate DECIMAL(5,2) DEFAULT 7.7,
    vat_amount DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,

    -- Validity
    valid_until DATE,

    -- Status
    status quote_status DEFAULT 'draft',
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- PDF
    pdf_url TEXT,

    -- Created by
    created_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quotes IS 'Client estimates - Devis clients';
COMMENT ON COLUMN quotes.status IS 'draft=Brouillon, sent=Envoyé, accepted=Accepté, rejected=Refusé, expired=Expiré';

-- 7. PRODUCTS TABLE (Catalog)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Product info
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT UNIQUE,

    -- Categorization
    category TEXT NOT NULL,
    subcategory TEXT,

    -- Pricing
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2),

    -- Supplier
    supplier TEXT,
    supplier_reference TEXT,
    supplier_url TEXT,

    -- Stock (optional)
    track_stock BOOLEAN DEFAULT false,
    stock_quantity INTEGER DEFAULT 0,
    min_stock_alert INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Service and parts catalog - Catalogue produits et services';

-- 8. EMAIL_INBOX TABLE (Parsed emails for review)
CREATE TABLE email_inbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Email metadata
    gmail_message_id TEXT UNIQUE NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    from_email TEXT NOT NULL,
    from_name TEXT,
    subject TEXT,

    -- Content
    body_text TEXT,
    body_html TEXT,

    -- AI extraction results
    extracted_data JSONB DEFAULT '{}',

    -- Classification
    regie_id UUID REFERENCES regies(id) ON DELETE SET NULL,
    confidence_score DECIMAL(3,2),

    -- Processing status
    status TEXT DEFAULT 'new',
    processed_at TIMESTAMPTZ,
    intervention_id UUID REFERENCES interventions(id) ON DELETE SET NULL,

    -- Error tracking
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_inbox IS 'Parsed emails from Gmail - Emails analysés depuis Gmail';
COMMENT ON COLUMN email_inbox.status IS 'new=Nouveau, processed=Traité, ignored=Ignoré, error=Erreur';

-- 9. AUDIT_LOG TABLE (For compliance and debugging)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What happened
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,

    -- Who did it
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email TEXT,

    -- Details
    old_values JSONB,
    new_values JSONB,

    -- Context
    ip_address TEXT,
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Change tracking - Journal des modifications';

-- =====================================================
-- INDEXES
-- =====================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Regies
CREATE INDEX idx_regies_keyword ON regies(keyword);
CREATE INDEX idx_regies_is_active ON regies(is_active);

-- Interventions
CREATE INDEX idx_interventions_status ON interventions(status);
CREATE INDEX idx_interventions_technician ON interventions(technician_id);
CREATE INDEX idx_interventions_regie ON interventions(regie_id);
CREATE INDEX idx_interventions_date_planned ON interventions(date_planned);
CREATE INDEX idx_interventions_calendar_id ON interventions(google_calendar_event_id);
CREATE INDEX idx_interventions_created_at ON interventions(created_at);

-- Reports
CREATE INDEX idx_reports_intervention ON reports(intervention_id);
CREATE INDEX idx_reports_technician ON reports(technician_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at);

-- Invoices
CREATE INDEX idx_invoices_report ON invoices(report_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);

-- Quotes
CREATE INDEX idx_quotes_regie ON quotes(regie_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_number ON quotes(quote_number);

-- Products
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_sku ON products(sku);

-- Email Inbox
CREATE INDEX idx_email_inbox_status ON email_inbox(status);
CREATE INDEX idx_email_inbox_regie ON email_inbox(regie_id);
CREATE INDEX idx_email_inbox_received_at ON email_inbox(received_at);

-- Audit Log
CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_record ON audit_log(record_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE regies ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user is admin or secretary
CREATE OR REPLACE FUNCTION public.is_admin_or_secretary()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role IN ('admin', 'secretary')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'admin'
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- USERS POLICIES
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_select_admin" ON users
    FOR SELECT USING (public.is_admin_or_secretary());

CREATE POLICY "users_manage_admin" ON users
    FOR ALL USING (public.is_admin());

CREATE POLICY "users_service_role" ON users
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- REGIES POLICIES
CREATE POLICY "regies_select_authenticated" ON regies
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "regies_manage_admin" ON regies
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "regies_service_role" ON regies
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- INTERVENTIONS POLICIES
CREATE POLICY "interventions_select_own" ON interventions
    FOR SELECT USING (technician_id = auth.uid());

CREATE POLICY "interventions_select_admin" ON interventions
    FOR SELECT USING (public.is_admin_or_secretary());

CREATE POLICY "interventions_update_own" ON interventions
    FOR UPDATE USING (technician_id = auth.uid());

CREATE POLICY "interventions_manage_admin" ON interventions
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "interventions_service_role" ON interventions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- REPORTS POLICIES
CREATE POLICY "reports_select_own" ON reports
    FOR SELECT USING (technician_id = auth.uid());

CREATE POLICY "reports_select_admin" ON reports
    FOR SELECT USING (public.is_admin_or_secretary());

CREATE POLICY "reports_insert_own" ON reports
    FOR INSERT WITH CHECK (technician_id = auth.uid());

CREATE POLICY "reports_update_own_draft" ON reports
    FOR UPDATE USING (technician_id = auth.uid() AND status = 'draft');

CREATE POLICY "reports_manage_admin" ON reports
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "reports_service_role" ON reports
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- INVOICES POLICIES
CREATE POLICY "invoices_select_authenticated" ON invoices
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "invoices_manage_admin" ON invoices
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "invoices_service_role" ON invoices
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- QUOTES POLICIES
CREATE POLICY "quotes_select_authenticated" ON quotes
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "quotes_manage_admin" ON quotes
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "quotes_service_role" ON quotes
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- PRODUCTS POLICIES
CREATE POLICY "products_select_authenticated" ON products
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "products_manage_admin" ON products
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "products_service_role" ON products
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- EMAIL_INBOX POLICIES
CREATE POLICY "email_inbox_select_admin" ON email_inbox
    FOR SELECT USING (public.is_admin_or_secretary());

CREATE POLICY "email_inbox_manage_admin" ON email_inbox
    FOR ALL USING (public.is_admin_or_secretary());

CREATE POLICY "email_inbox_service_role" ON email_inbox
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- AUDIT_LOG POLICIES
CREATE POLICY "audit_log_select_admin" ON audit_log
    FOR SELECT USING (public.is_admin());

CREATE POLICY "audit_log_insert_all" ON audit_log
    FOR INSERT WITH CHECK (true);

CREATE POLICY "audit_log_service_role" ON audit_log
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_regies_updated_at
    BEFORE UPDATE ON regies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_interventions_updated_at
    BEFORE UPDATE ON interventions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate invoice number (YYYY-NNNNN)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    next_num INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(invoice_number FROM 6) AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM invoices
    WHERE invoice_number LIKE year_prefix || '-%';

    NEW.invoice_number := year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_invoice_number
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL)
    EXECUTE FUNCTION generate_invoice_number();

-- Auto-generate quote number (DYYYY-NNNNN)
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    next_num INTEGER;
BEGIN
    year_prefix := 'D' || TO_CHAR(NOW(), 'YYYY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(quote_number FROM 7) AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM quotes
    WHERE quote_number LIKE year_prefix || '-%';

    NEW.quote_number := year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_quote_number
    BEFORE INSERT ON quotes
    FOR EACH ROW
    WHEN (NEW.quote_number IS NULL)
    EXECUTE FUNCTION generate_quote_number();

-- Audit log trigger function
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (action, table_name, record_id, new_values, user_id)
        VALUES ('create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (action, table_name, record_id, old_values, new_values, user_id)
        VALUES ('update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (action, table_name, record_id, old_values, user_id)
        VALUES ('delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), auth.uid());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to critical tables
CREATE TRIGGER tr_interventions_audit
    AFTER INSERT OR UPDATE OR DELETE ON interventions
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER tr_reports_audit
    AFTER INSERT OR UPDATE OR DELETE ON reports
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER tr_invoices_audit
    AFTER INSERT OR UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- =====================================================
-- REALTIME CONFIGURATION
-- =====================================================

-- Enable Realtime for interventions table (critical for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE interventions;

-- Enable Realtime for reports table (for admin dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE reports;

-- Enable Realtime for email_inbox table (for inbox updates)
ALTER PUBLICATION supabase_realtime ADD TABLE email_inbox;

-- =====================================================
-- STORAGE BUCKETS (run via Supabase Dashboard or API)
-- =====================================================

-- Note: Storage buckets must be created via Supabase Dashboard or API
-- The following are the bucket configurations needed:

-- 1. audio - For voice recordings
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);

-- 2. photos - For intervention photos
-- INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false);

-- 3. documents - For PDFs (invoices, quotes)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies will be created after buckets exist

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default regies
INSERT INTO regies (name, keyword, email_contact) VALUES
    ('Foncia Genève', 'FONCIA', 'geneve@foncia.ch'),
    ('Naef Immobilier', 'NAEF', 'contact@naef.ch'),
    ('SIPA SA', 'SIPA', 'service@sipa.ch'),
    ('Régie du Rhône', 'RHONE', 'info@regiedurhone.ch'),
    ('Bernard Nicod', 'NICOD', 'geneve@bernard-nicod.ch');

-- Insert default products (services and common parts)
INSERT INTO products (name, category, price, supplier, description) VALUES
    ('Main d''oeuvre (1h)', 'service', 95.00, 'Richoz', 'Tarif horaire technicien'),
    ('Déplacement', 'service', 50.00, 'Richoz', 'Frais de déplacement forfaitaire'),
    ('Déplacement urgence', 'service', 80.00, 'Richoz', 'Frais de déplacement urgence'),
    ('Majoration nuit/weekend', 'service', 47.50, 'Richoz', 'Supplément horaire hors heures ouvrables'),
    ('Joint standard', 'plomberie', 5.50, 'Sanitas Troesch', 'Joint caoutchouc universel'),
    ('Joint fibre', 'plomberie', 3.50, 'Sanitas Troesch', 'Joint fibre pour raccord'),
    ('Flexible douche 1.5m', 'plomberie', 25.00, 'Grohe', 'Flexible de douche standard'),
    ('Flexible douche 2m', 'plomberie', 32.00, 'Grohe', 'Flexible de douche long'),
    ('Robinet mitigeur lavabo', 'plomberie', 85.00, 'Grohe', 'Mitigeur monocommande'),
    ('Robinet mitigeur cuisine', 'plomberie', 120.00, 'Grohe', 'Mitigeur cuisine bec haut'),
    ('Mécanisme chasse d''eau', 'plomberie', 45.00, 'Geberit', 'Mécanisme complet'),
    ('Flotteur WC', 'plomberie', 28.00, 'Geberit', 'Robinet flotteur'),
    ('Siphon lavabo', 'plomberie', 18.00, 'Viega', 'Siphon PVC chromé'),
    ('Thermostat radiateur', 'chauffage', 45.00, 'Danfoss', 'Tête thermostatique'),
    ('Vanne radiateur', 'chauffage', 35.00, 'Danfoss', 'Corps de vanne'),
    ('Purgeur automatique', 'chauffage', 15.00, 'Flamco', 'Purgeur air automatique'),
    ('Circulateur chauffage', 'chauffage', 280.00, 'Grundfos', 'Pompe de circulation'),
    ('Vase expansion 8L', 'chauffage', 65.00, 'Flamco', 'Vase d''expansion sanitaire');

-- =====================================================
-- STORAGE BUCKET CREATION (SQL alternative)
-- =====================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('audio', 'audio', false, 52428800, ARRAY['audio/webm', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg']),
    ('photos', 'photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    ('documents', 'documents', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for audio bucket
CREATE POLICY "audio_insert_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'audio');

CREATE POLICY "audio_select_own" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "audio_select_admin" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'audio' AND public.is_admin_or_secretary());

CREATE POLICY "audio_service_role" ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'audio');

-- Storage policies for photos bucket
CREATE POLICY "photos_insert_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'photos');

CREATE POLICY "photos_select_own" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "photos_select_admin" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'photos' AND public.is_admin_or_secretary());

CREATE POLICY "photos_service_role" ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'photos');

-- Storage policies for documents bucket
CREATE POLICY "documents_select_authenticated" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'documents');

CREATE POLICY "documents_manage_admin" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'documents' AND public.is_admin_or_secretary());

CREATE POLICY "documents_service_role" ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'documents');

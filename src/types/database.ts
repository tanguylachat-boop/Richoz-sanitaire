// ==============================================
// RICHOZ SANITAIRE - Database Types
// Auto-generated types for Supabase
// Run: npm run db:types to regenerate
// ==============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'secretary' | 'technician';
export type InterventionStatus = 'nouveau' | 'planifie' | 'en_cours' | 'termine' | 'ready_to_bill' | 'billed' | 'annule';
export type InvoiceStatus = 'generated' | 'sent' | 'paid';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type ReportStatus = 'draft' | 'submitted' | 'validated' | 'rejected';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          first_name: string;
          last_name: string;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          role?: UserRole;
          first_name: string;
          last_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      regies: {
        Row: {
          id: string;
          name: string;
          keyword: string;
          email_contact: string | null;
          phone: string | null;
          address: string | null;
          discount_percentage: number;
          billing_email: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          keyword: string;
          email_contact?: string | null;
          phone?: string | null;
          address?: string | null;
          discount_percentage?: number;
          billing_email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          keyword?: string;
          email_contact?: string | null;
          phone?: string | null;
          address?: string | null;
          discount_percentage?: number;
          billing_email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      interventions: {
        Row: {
          id: string;
          regie_id: string | null;
          technician_id: string | null;
          status: InterventionStatus;
          title: string;
          description: string | null;
          address: string;
          date_planned: string | null;
          date_completed: string | null;
          estimated_duration_minutes: number;
          google_calendar_event_id: string | null;
          client_info: Json;
          source_email_id: string | null;
          source_type: string;
          priority: number;
          notes: string | null;
          work_order_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          regie_id?: string | null;
          technician_id?: string | null;
          status?: InterventionStatus;
          title: string;
          description?: string | null;
          address: string;
          date_planned?: string | null;
          date_completed?: string | null;
          estimated_duration_minutes?: number;
          google_calendar_event_id?: string | null;
          client_info?: Json;
          source_email_id?: string | null;
          source_type?: string;
          priority?: number;
          notes?: string | null;
          work_order_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          regie_id?: string | null;
          technician_id?: string | null;
          status?: InterventionStatus;
          title?: string;
          description?: string | null;
          address?: string;
          date_planned?: string | null;
          date_completed?: string | null;
          estimated_duration_minutes?: number;
          google_calendar_event_id?: string | null;
          client_info?: Json;
          source_email_id?: string | null;
          source_type?: string;
          priority?: number;
          notes?: string | null;
          work_order_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          intervention_id: string;
          technician_id: string;
          text_content: string | null;
          vocal_url: string | null;
          vocal_transcription: string | null;
          photos: Json;
          checklist: Json;
          is_billable: boolean;
          billable_reason: string | null;
          work_duration_minutes: number | null;
          materials_used: Json;
          status: ReportStatus;
          validated_at: string | null;
          validated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          intervention_id: string;
          technician_id: string;
          text_content?: string | null;
          vocal_url?: string | null;
          vocal_transcription?: string | null;
          photos?: Json;
          checklist?: Json;
          is_billable?: boolean;
          billable_reason?: string | null;
          work_duration_minutes?: number | null;
          materials_used?: Json;
          status?: ReportStatus;
          validated_at?: string | null;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          intervention_id?: string;
          technician_id?: string;
          text_content?: string | null;
          vocal_url?: string | null;
          vocal_transcription?: string | null;
          photos?: Json;
          checklist?: Json;
          is_billable?: boolean;
          billable_reason?: string | null;
          work_duration_minutes?: number | null;
          materials_used?: Json;
          status?: ReportStatus;
          validated_at?: string | null;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          date: string;
          client_name: string;
          client_address: string;
          amount_total: number;
          status: InvoiceStatus;
          pdf_url: string | null;
        };
        Insert: {
          id?: string;
          invoice_number: string;
          date: string;
          client_name: string;
          client_address: string;
          amount_total: number;
          status?: InvoiceStatus;
          pdf_url?: string | null;
        };
        Update: {
          id?: string;
          invoice_number?: string;
          date?: string;
          client_name?: string;
          client_address?: string;
          amount_total?: number;
          status?: InvoiceStatus;
          pdf_url?: string | null;
        };
      };
      quotes: {
        Row: {
          id: string;
          client_name: string;
          client_email: string | null;
          client_phone: string | null;
          client_address: string | null;
          regie_id: string | null;
          quote_number: string;
          title: string | null;
          description: string | null;
          items: Json;
          subtotal: number;
          discount_regie: boolean;
          discount_percentage: number;
          discount_amount: number;
          vat_rate: number;
          vat_amount: number;
          total: number;
          valid_until: string | null;
          status: QuoteStatus;
          accepted_at: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          pdf_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          client_email?: string | null;
          client_phone?: string | null;
          client_address?: string | null;
          regie_id?: string | null;
          quote_number?: string;
          title?: string | null;
          description?: string | null;
          items: Json;
          subtotal: number;
          discount_regie?: boolean;
          discount_percentage?: number;
          discount_amount?: number;
          vat_rate?: number;
          vat_amount: number;
          total: number;
          valid_until?: string | null;
          status?: QuoteStatus;
          accepted_at?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          pdf_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_name?: string;
          client_email?: string | null;
          client_phone?: string | null;
          client_address?: string | null;
          regie_id?: string | null;
          quote_number?: string;
          title?: string | null;
          description?: string | null;
          items?: Json;
          subtotal?: number;
          discount_regie?: boolean;
          discount_percentage?: number;
          discount_amount?: number;
          vat_rate?: number;
          vat_amount?: number;
          total?: number;
          valid_until?: string | null;
          status?: QuoteStatus;
          accepted_at?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          pdf_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          sku: string | null;
          category: string;
          subcategory: string | null;
          price: number;
          cost_price: number | null;
          supplier: string | null;
          supplier_reference: string | null;
          supplier_url: string | null;
          track_stock: boolean;
          stock_quantity: number;
          min_stock_alert: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          sku?: string | null;
          category: string;
          subcategory?: string | null;
          price: number;
          cost_price?: number | null;
          supplier?: string | null;
          supplier_reference?: string | null;
          supplier_url?: string | null;
          track_stock?: boolean;
          stock_quantity?: number;
          min_stock_alert?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          sku?: string | null;
          category?: string;
          subcategory?: string | null;
          price?: number;
          cost_price?: number | null;
          supplier?: string | null;
          supplier_reference?: string | null;
          supplier_url?: string | null;
          track_stock?: boolean;
          stock_quantity?: number;
          min_stock_alert?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_inbox: {
        Row: {
          id: string;
          gmail_message_id: string;
          received_at: string;
          from_email: string;
          from_name: string | null;
          subject: string | null;
          body_text: string | null;
          body_html: string | null;
          extracted_data: Json;
          regie_id: string | null;
          confidence_score: number | null;
          status: string;
          processed_at: string | null;
          intervention_id: string | null;
          error_message: string | null;
          work_order_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gmail_message_id: string;
          received_at: string;
          from_email: string;
          from_name?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          extracted_data?: Json;
          regie_id?: string | null;
          confidence_score?: number | null;
          status?: string;
          processed_at?: string | null;
          intervention_id?: string | null;
          error_message?: string | null;
          work_order_number?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          gmail_message_id?: string;
          received_at?: string;
          from_email?: string;
          from_name?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          extracted_data?: Json;
          regie_id?: string | null;
          confidence_score?: number | null;
          status?: string;
          processed_at?: string | null;
          intervention_id?: string | null;
          error_message?: string | null;
          work_order_number?: string | null;
          created_at?: string;
        };
      };
      company_settings: {
        Row: {
          id: string;
          company_name: string;
          address: string;
          email: string;
          phone: string;
          iban: string;
          vat_number: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name?: string;
          address?: string;
          email?: string;
          phone?: string;
          iban?: string;
          vat_number?: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          address?: string;
          email?: string;
          phone?: string;
          iban?: string;
          vat_number?: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          action: string;
          table_name: string;
          record_id: string;
          user_id: string | null;
          user_email: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          table_name: string;
          record_id: string;
          user_id?: string | null;
          user_email?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          table_name?: string;
          record_id?: string;
          user_id?: string | null;
          user_email?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      is_admin_or_secretary: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      intervention_status: InterventionStatus;
      invoice_status: InvoiceStatus;
      quote_status: QuoteStatus;
      report_status: ReportStatus;
    };
  };
}

// Helper types for easier usage
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Convenience types
export type User = Tables<'users'>;
export type Regie = Tables<'regies'>;
export type Intervention = Tables<'interventions'>;
export type Report = Tables<'reports'>;
export type Invoice = Tables<'invoices'>;
export type Quote = Tables<'quotes'>;
export type Product = Tables<'products'>;
export type EmailInbox = Tables<'email_inbox'>;
export type AuditLog = Tables<'audit_log'>;
export type CompanySettings = Tables<'company_settings'>;

// Extended types with relations
export interface InterventionWithRelations extends Intervention {
  regie?: Regie | null;
  technician?: User | null;
  reports?: Report[];
}

export interface ReportWithRelations extends Report {
  intervention?: Intervention | null;
  technician?: User | null;
  validator?: User | null;
}

export type InvoiceWithRelations = Invoice;

// Client info JSON structure
export interface ClientInfo {
  name?: string;
  phone?: string;
  email?: string;
  apartment?: string;
  access_code?: string;
  notes?: string;
}

// Photo JSON structure
export interface PhotoItem {
  url: string;
  caption?: string;
  uploaded_at?: string;
}

// Checklist JSON structure
export interface ChecklistItem {
  item: string;
  done: boolean;
}

// Material JSON structure
export interface MaterialUsed {
  product_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
}

// Line item JSON structure
export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

// Extracted data from email JSON structure
export interface ExtractedEmailData {
  client_name?: string;
  address?: string;
  phone?: string;
  issue_description?: string;
  urgency?: string;
  apartment?: string;
}

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


// SDK table structure with explicit relationships, shared by the existing V3 row types.
type TableDefinition<Row, Required extends keyof Row, Relationships> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: Relationships;
};
type ForeignKey<Table extends string, Column extends string, Target extends string> = {
  foreignKeyName: `${Table}_${Column}_fkey`;
  columns: [Column]; isOneToOne: false; referencedRelation: Target; referencedColumns: ['id'];
};

export interface Database {
  public: {
    Tables: {
      services_catalog: TableDefinition<{ id: number; name: string; description: string; default_price: number; unit: string }, 'name' | 'default_price', []>;
      quote_items: TableDefinition<{ id: string; quote_id: string; item_type: string; description: string; quantity: number; unit_price: number; section_name: string | null; catalog_service_id: number | null }, 'quote_id' | 'description', [ForeignKey<'quote_items','quote_id','quotes'>]>;
      clients: TableDefinition<Client, 'client_type', [ForeignKey<'clients','regie_id','regies'>]>;
      piquet_schedule: TableDefinition<PiquetSchedule, 'technician_id' | 'start_date' | 'end_date', [ForeignKey<'piquet_schedule','technician_id','users'>]>;
      piquet_reports: TableDefinition<PiquetReport, 'technician_id' | 'address' | 'call_received_at', [ForeignKey<'piquet_reports','technician_id','users'>, ForeignKey<'piquet_reports','client_id','clients'>, ForeignKey<'piquet_reports','intervention_id','interventions'>]>;
      maintenance_contracts: TableDefinition<MaintenanceContract, 'client_id' | 'title', [ForeignKey<'maintenance_contracts','client_id','clients'>, ForeignKey<'maintenance_contracts','regie_id','regies'>]>;
      chantier_details: TableDefinition<{
        id: string; intervention_id: string; architect_name: string | null; architect_phone: string | null; architect_email: string | null;
        site_manager_name: string | null; site_manager_phone: string | null; keys_location: string | null; access_notes: string | null;
        progress_percent: number; created_at: string; updated_at: string;
      }, 'intervention_id', [ForeignKey<'chantier_details','intervention_id','interventions'>]>;
      chantier_messages: TableDefinition<{
        id: string; intervention_id: string; author_id: string | null; message: string; photos: string[]; created_at: string;
      }, 'intervention_id' | 'message', [ForeignKey<'chantier_messages','intervention_id','interventions'>, ForeignKey<'chantier_messages','author_id','users'>]>;
      chantier_cutoff_notices: TableDefinition<{
        id: string; intervention_id: string; cutoff_type: string; start_date: string; end_date_estimated: string | null;
        floors_affected: string | null; message: string | null; notice_pdf_url: string | null; created_by: string | null; created_at: string;
      }, 'intervention_id' | 'cutoff_type' | 'start_date', [ForeignKey<'chantier_cutoff_notices','intervention_id','interventions'>, ForeignKey<'chantier_cutoff_notices','created_by','users'>]>;
      chantier_photos: TableDefinition<{
        id: string; intervention_id: string; user_id: string | null; photo_url: string; caption: string | null; created_at: string;
      }, 'intervention_id' | 'photo_url', [ForeignKey<'chantier_photos','intervention_id','interventions'>, ForeignKey<'chantier_photos','user_id','users'>]>;

      users: {
        Relationships: [];
        Row: {
          id: string;
          email: string;
          role: UserRole;
          first_name: string;
          last_name: string;
          phone: string | null;
          avatar_url: string | null;
          birth_date: string | null;
          annual_leave_weeks: number;
          intervention_type_preference: 'depannage' | 'chantier' | null;
          calendar_color: string | null;
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
          birth_date?: string | null;
          annual_leave_weeks?: number;
          intervention_type_preference?: 'depannage' | 'chantier' | null;
          calendar_color?: string | null;
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
          birth_date?: string | null;
          annual_leave_weeks?: number;
          intervention_type_preference?: 'depannage' | 'chantier' | null;
          calendar_color?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      regies: {
        Relationships: [];
        Row: {
          email_domains: string[] | null;

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
        Relationships: [
          { foreignKeyName: 'interventions_regie_id_fkey'; columns: ['regie_id']; isOneToOne: false; referencedRelation: 'regies'; referencedColumns: ['id'] },
          { foreignKeyName: 'interventions_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
        Row: {
          maintenance_contract_id: string | null;
          is_piquet: boolean;

          id: string;
          regie_id: string | null;
          technician_id: string | null;
          status: InterventionStatus;
          intervention_type: 'depannage' | 'chantier';
          client_id: string | null;
          title: string;
          description: string | null;
          address: string;
          date_planned: string | null;
          date_end: string | null;
          date_completed: string | null;
          estimated_duration_minutes: number;
          google_calendar_event_id: string | null;
          client_info: Json;
          source_email_id: string | null;
          source_type: string;
          priority: number;
          notes: string | null;
          work_order_number: string | null;
          keys_info: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          regie_id?: string | null;
          technician_id?: string | null;
          status?: InterventionStatus;
          intervention_type?: 'depannage' | 'chantier';
          client_id?: string | null;
          title: string;
          description?: string | null;
          address: string;
          date_planned?: string | null;
          date_end?: string | null;
          date_completed?: string | null;
          estimated_duration_minutes?: number;
          google_calendar_event_id?: string | null;
          client_info?: Json;
          source_email_id?: string | null;
          source_type?: string;
          priority?: number;
          notes?: string | null;
          work_order_number?: string | null;
          keys_info?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          regie_id?: string | null;
          technician_id?: string | null;
          status?: InterventionStatus;
          intervention_type?: 'depannage' | 'chantier';
          client_id?: string | null;
          title?: string;
          description?: string | null;
          address?: string;
          date_planned?: string | null;
          date_end?: string | null;
          date_completed?: string | null;
          estimated_duration_minutes?: number;
          google_calendar_event_id?: string | null;
          client_info?: Json;
          source_email_id?: string | null;
          source_type?: string;
          priority?: number;
          notes?: string | null;
          work_order_number?: string | null;
          keys_info?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reports: {
        Relationships: [
          { foreignKeyName: 'reports_intervention_id_fkey'; columns: ['intervention_id']; isOneToOne: false; referencedRelation: 'interventions'; referencedColumns: ['id'] },
          { foreignKeyName: 'reports_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'reports_validated_by_fkey'; columns: ['validated_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
        Row: {
          pdf_url: string | null;
          docx_url: string | null;

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
          supplies_text: string | null;
          client_signature: string | null;
          is_completed: boolean;
          revision_requested: boolean;
          revision_message: string | null;
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
          supplies_text?: string | null;
          client_signature?: string | null;
          is_completed?: boolean;
          revision_requested?: boolean;
          revision_message?: string | null;
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
          supplies_text?: string | null;
          client_signature?: string | null;
          is_completed?: boolean;
          revision_requested?: boolean;
          revision_message?: string | null;
          status?: ReportStatus;
          validated_at?: string | null;
          validated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Relationships: [
          { foreignKeyName: 'invoices_report_id_fkey'; columns: ['report_id']; isOneToOne: false; referencedRelation: 'reports'; referencedColumns: ['id'] },
        ];
        Row: {
          total: number;
          created_at: string;
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
        Relationships: [
          { foreignKeyName: 'quotes_regie_id_fkey'; columns: ['regie_id']; isOneToOne: false; referencedRelation: 'regies'; referencedColumns: ['id'] },
        ];
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
          parent_quote_id: string | null;
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
          parent_quote_id?: string | null;
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
          parent_quote_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Relationships: [];
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
        Relationships: [
          { foreignKeyName: 'email_inbox_regie_id_fkey'; columns: ['regie_id']; isOneToOne: false; referencedRelation: 'regies'; referencedColumns: ['id'] },
          { foreignKeyName: 'email_inbox_intervention_id_fkey'; columns: ['intervention_id']; isOneToOne: false; referencedRelation: 'interventions'; referencedColumns: ['id'] },
        ];
        Row: {
          email_type: string | null;
          attachment_urls: string[] | null;
          category: string | null;

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
        Relationships: [];
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
      intervention_reminders: {
        Relationships: [
          { foreignKeyName: 'intervention_reminders_intervention_id_fkey'; columns: ['intervention_id']; isOneToOne: false; referencedRelation: 'interventions'; referencedColumns: ['id'] },
          { foreignKeyName: 'intervention_reminders_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
        Row: {
          id: string;
          intervention_id: string;
          user_id: string;
          reminder_date: string;
          reminder_type: string;
          message: string;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          intervention_id: string;
          user_id: string;
          reminder_date: string;
          message: string;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          intervention_id?: string;
          user_id?: string;
          reminder_date?: string;
          message?: string;
          completed?: boolean;
          created_at?: string;
        };
      };
      notifications: {
        Relationships: [
          { foreignKeyName: 'notifications_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'notifications_intervention_id_fkey'; columns: ['intervention_id']; isOneToOne: false; referencedRelation: 'interventions'; referencedColumns: ['id'] },
        ];
        Row: {
          id: string;
          user_id: string;
          recipient_id: string;
          sender_id: string | null;
          reference_id: string | null;
          reference_type: string | null;
          title: string;
          message: string | null;
          type: string;
          intervention_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          recipient_id?: string;
          sender_id?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          title: string;
          message?: string | null;
          type?: string;
          intervention_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recipient_id?: string;
          sender_id?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          title?: string;
          message?: string | null;
          type?: string;
          intervention_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string | null };
        Insert: { id?: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at?: string | null };
        Update: { id?: string; user_id?: string; endpoint?: string; p256dh?: string; auth?: string; created_at?: string | null };
        Relationships: [{ foreignKeyName: 'push_subscriptions_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      leave_requests: {
        Row: { id: string; technician_id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null; reason: string | null; status: string; leave_type: string; rejection_reason: string | null; reviewed_at: string | null; reviewed_by: string | null; created_at: string };
        Insert: { id?: string; technician_id: string; start_date: string; end_date: string; start_time?: string | null; end_time?: string | null; reason?: string | null; status?: string; leave_type?: string; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string };
        Update: { technician_id?: string; start_date?: string; end_date?: string; start_time?: string | null; end_time?: string | null; reason?: string | null; status?: string; leave_type?: string; rejection_reason?: string | null; reviewed_by?: string | null; reviewed_at?: string | null };
        Relationships: [{ foreignKeyName: 'leave_requests_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      leave_request_history: {
        Row: { id: string; leave_request_id: string; technician_id: string; action: string; changed_by: string | null; changed_at: string; old_values: Json | null; new_values: Json | null };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: 'leave_request_history_changed_by_fkey'; columns: ['changed_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      salary_items: {
        Row: { id: string; technician_id: string; item_type: string; item_date: string; period_start: string | null; period_end: string | null; minutes: number | null; amount_chf: number | null; expected_time: string | null; actual_time: string | null; origin: string; source_id: string | null; reason: string | null; justification: string | null; compensation_mode: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null; payroll_status: string; payroll_reference: string | null; payroll_processed_at: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; technician_id: string; item_type: string; item_date?: string; period_start?: string | null; period_end?: string | null; minutes?: number | null; amount_chf?: number | null; expected_time?: string | null; actual_time?: string | null; origin?: string; source_id?: string | null; reason?: string | null; justification?: string | null; compensation_mode?: string | null; status?: string; reviewed_by?: string | null; reviewed_at?: string | null; review_note?: string | null; created_by: string };
        Update: { item_date?: string; period_start?: string | null; period_end?: string | null; minutes?: number | null; amount_chf?: number | null; expected_time?: string | null; actual_time?: string | null; reason?: string | null; justification?: string | null; compensation_mode?: string | null; status?: string; reviewed_by?: string | null; reviewed_at?: string | null; review_note?: string | null };
        Relationships: [{ foreignKeyName: 'salary_items_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      salary_item_history: {
        Row: { id: string; salary_item_id: string; technician_id: string; action: string; changed_by: string | null; changed_at: string; old_values: Json | null; new_values: Json | null };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: 'salary_item_history_changed_by_fkey'; columns: ['changed_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      payroll_drafts: {
        Row: { id: string; technician_id: string; period_start: string; period_end: string; version: number; status: string; is_regularization: boolean; generated_at: string; generated_by: string | null; validated_by: string | null; validated_at: string | null; notes: string | null; worked_hours: number | null; worked_hours_source: string; net_chf: number | null };
        Insert: { id?: string; technician_id: string; period_start: string; period_end: string; version?: number; status?: string; is_regularization?: boolean; generated_by?: string | null; notes?: string | null; worked_hours?: number | null; worked_hours_source?: string };
        Update: { status?: string; validated_by?: string | null; validated_at?: string | null; notes?: string | null; worked_hours?: number | null; worked_hours_source?: string };
        Relationships: [{ foreignKeyName: 'payroll_drafts_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      technician_locations: {
        Row: { technician_id: string; is_sharing: boolean; latitude: number | null; longitude: number | null; accuracy_m: number | null; recorded_at: string | null; updated_at: string };
        Insert: { technician_id: string; is_sharing?: boolean; latitude?: number | null; longitude?: number | null; accuracy_m?: number | null; recorded_at?: string | null };
        Update: { is_sharing?: boolean; latitude?: number | null; longitude?: number | null; accuracy_m?: number | null; recorded_at?: string | null };
        Relationships: [{ foreignKeyName: 'technician_locations_technician_id_fkey'; columns: ['technician_id']; isOneToOne: true; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      payroll_draft_lines: {
        Row: { id: string; draft_id: string; line_type: string; salary_item_id: string | null; component_id: string | null; label: string; minutes: number | null; amount_chf: number | null; amount_state: string; overridden: boolean; source_snapshot: Json | null; created_at: string };
        Insert: { id?: string; draft_id: string; line_type: string; salary_item_id?: string | null; component_id?: string | null; label: string; minutes?: number | null; amount_chf?: number | null; amount_state: string; overridden?: boolean; source_snapshot?: Json | null };
        Update: { label?: string; minutes?: number | null; amount_chf?: number | null; amount_state?: string; overridden?: boolean };
        Relationships: [{ foreignKeyName: 'payroll_draft_lines_draft_id_fkey'; columns: ['draft_id']; isOneToOne: false; referencedRelation: 'payroll_drafts'; referencedColumns: ['id'] }];
      };
      employee_salary_config: {
        Row: { id: string; technician_id: string; pay_type: string; monthly_base_chf: number | null; hourly_rate_chf: number; overtime_supplement_pct: number; effective_from: string; is_active: boolean; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; technician_id: string; pay_type: string; monthly_base_chf?: number | null; hourly_rate_chf: number; overtime_supplement_pct?: number; effective_from?: string; is_active?: boolean; created_by?: string | null };
        Update: { pay_type?: string; monthly_base_chf?: number | null; hourly_rate_chf?: number; overtime_supplement_pct?: number; effective_from?: string; is_active?: boolean };
        Relationships: [{ foreignKeyName: 'employee_salary_config_technician_id_fkey'; columns: ['technician_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      employee_salary_config_history: {
        Row: { id: string; config_id: string; technician_id: string; action: string; changed_by: string | null; changed_at: string; old_values: Json | null; new_values: Json | null };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: 'employee_salary_config_history_changed_by_fkey'; columns: ['changed_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }];
      };
      salary_config_component: {
        Row: { id: string; config_id: string; label: string; direction: string; basis: string; pct: number | null; amount_chf: number | null; sort_order: number; created_at: string };
        Insert: { id?: string; config_id: string; label: string; direction: string; basis: string; pct?: number | null; amount_chf?: number | null; sort_order?: number };
        Update: { label?: string; direction?: string; basis?: string; pct?: number | null; amount_chf?: number | null; sort_order?: number };
        Relationships: [{ foreignKeyName: 'salary_config_component_config_id_fkey'; columns: ['config_id']; isOneToOne: false; referencedRelation: 'employee_salary_config'; referencedColumns: ['id'] }];
      };
      audit_log: {
        Relationships: [
          { foreignKeyName: 'audit_log_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
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
      get_report_followup: { Args: Record<PropertyKey, never>; Returns: Json };
      confirm_report_expectation: { Args: { p_intervention: string; p_reference: string; p_due?: string | null }; Returns: undefined };
      remind_report: { Args: { p_intervention: string; p_interval_seconds: number; p_expected?: string | null }; Returns: Json };
      run_report_reminders: { Args: { p_config: Json; p_dry?: boolean; p_now?: string }; Returns: Json };
      generate_payroll_drafts: { Args: { p_reference: string; p_dry?: boolean }; Returns: Json };
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
export type Notification = Tables<'notifications'>;
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

// ==============================================
// V3 — Clients, Piquet, Maintenance Contracts
// ==============================================

export type ClientType = 'locataire' | 'proprietaire' | 'particulier' | 'entreprise';

export interface Client {
  id: string;
  client_type: ClientType;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  apartment: string | null;
  city: string | null;
  postal_code: string | null;
  regie_id: string | null;
  owner_name: string | null;
  notes: string | null;
  tags: string[];
  bexio_nr: string | null;
  created_at: string;
  updated_at: string;
}

export interface PiquetSchedule {
  id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type PiquetReportStatus = 'draft' | 'submitted' | 'validated' | 'billed';

export interface PiquetReport {
  id: string;
  intervention_id: string | null;
  technician_id: string;
  client_id: string | null;
  call_received_at: string;
  intervention_started_at: string | null;
  intervention_ended_at: string | null;
  client_name: string | null;
  client_phone: string | null;
  address: string;
  problem_description: string | null;
  actions_taken: string | null;
  supplies_used: string | null;
  photos: string[];
  client_signature: string | null;
  travel_distance_km: number | null;
  is_billable: boolean;
  status: PiquetReportStatus;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MaintenanceFrequency = 'annuel' | 'biannuel' | 'trimestriel' | 'mensuel' | 'custom';
export type MaintenanceContractStatus = 'active' | 'paused' | 'terminated' | 'expired';

export interface MaintenanceContract {
  id: string;
  contract_number: string;
  client_id: string | null;
  regie_id: string | null;
  title: string;
  description: string | null;
  equipment: string | null;
  address: string | null;
  frequency: MaintenanceFrequency;
  custom_interval_days: number | null;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  last_performed_date: string | null;
  amount_per_visit: number;
  estimated_duration_minutes: number | null;
  auto_generate_intervention: boolean;
  reminder_days_before: number | null;
  status: MaintenanceContractStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

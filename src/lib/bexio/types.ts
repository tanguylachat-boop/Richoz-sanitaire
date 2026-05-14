// Subset of the Bexio API types we care about.

export interface BexioContact {
  id: number;
  nr: string;
  contact_type_id: number; // 1 = company, 2 = person
  name_1: string;
  name_2: string | null;
  salutation_id: number | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  country_id: number | null;
  mail: string | null;
  phone_fixed: string | null;
  phone_mobile: string | null;
  contact_group_ids: string | null;
  contact_branch_ids: string | null;
  user_id: number;
  owner_id: number;
  updated_at: string;
}

export interface BexioContactCreate {
  contact_type_id: number; // 1 company | 2 person
  name_1: string;
  name_2?: string;
  address?: string;
  postcode?: string;
  city?: string;
  country_id?: number; // 1 = CH
  mail?: string;
  phone_fixed?: string;
  phone_mobile?: string;
  user_id: number;
  owner_id: number;
}

export interface BexioInvoicePosition {
  type: 'KbPositionCustom' | 'KbPositionArticle';
  amount: string | number;
  unit_id?: number | null;
  account_id?: number;
  unit_name?: string;
  tax_id?: number;
  tax_value?: string;
  text: string;
  unit_price: string | number;
  discount_in_percent?: number;
  position_total?: string;
  pos?: number;
  internal_pos?: number;
  is_optional?: boolean;
  article_id?: number | null;
}

export interface BexioInvoice {
  id: number;
  document_nr: string;
  title: string | null;
  contact_id: number;
  contact_sub_id: number | null;
  user_id: number;
  project_id: number | null;
  bank_account_id: number | null;
  currency_id: number;
  payment_type_id: number;
  header: string | null;
  footer: string | null;
  total_gross: string;
  total_net: string;
  total_taxes: string;
  total: string;
  total_rounding_difference: number;
  total_received_payments: string;
  total_credit_vouchers: string;
  total_remaining_payments: string;
  is_valid_from: string;
  is_valid_to: string;
  contact_address: string;
  reference: string | null;
  api_reference: string | null;
  viewed_by_client_at: string | null;
  updated_at: string;
  kb_item_status_id: number;
  mwst_type: number;
  mwst_is_net: boolean;
  show_position_taxes: boolean;
  positions?: BexioInvoicePosition[];
}

export interface BexioInvoiceCreate {
  title?: string;
  contact_id: number;
  user_id: number;
  pr_project_id?: number;
  language_id?: number;
  bank_account_id?: number;
  currency_id?: number;
  payment_type_id?: number;
  header?: string;
  footer?: string;
  mwst_type?: number; // 0 = net incl., 1 = net excl., 2 = no VAT
  mwst_is_net?: boolean;
  show_position_taxes?: boolean;
  is_valid_from?: string; // YYYY-MM-DD
  is_valid_to?: string;   // YYYY-MM-DD = due date
  reference?: string;
  api_reference?: string;
  positions: BexioInvoicePosition[];
}

export interface BexioArticle {
  id: number;
  user_id: number;
  intern_name: string;
  intern_code: string;
  intern_description: string;
  purchase_price: string | null;
  sale_price: string | null;
  purchase_total: string | null;
  sale_total: string | null;
  currency_id: number;
  tax_income_id: number | null;
  tax_id: number | null;
  tax_expense_id: number | null;
  unit_id: number | null;
  is_stock: boolean;
  stock_id: number | null;
  stock_place_id: number | null;
  stock_nr: number;
  stock_min_nr: number;
  stock_reserved_nr: number;
  stock_available_nr: number;
  stock_picked_nr: number;
  article_type_id: number;
  contact_id: number | null;
  deliverer_code: string | null;
  deliverer_name: string | null;
  deliverer_description: string | null;
  picture: string | null;
}

// kb_item_status_id mapping — these values come from Bexio's predefined list
// for KbInvoiceStatus (Settings → Document numbering / Status):
//   7  = Draft (Entwurf)
//   8  = Pending (Offen / In Bearbeitung)
//   9  = Paid (Bezahlt)
//   10 = Overdue (Überfällig)
//   16 = Cancelled (Storniert)
//   17 = Unpaid (Teilweise bezahlt)
// We expose semantic strings instead of raw numbers in our DB.
export const BEXIO_STATUS_TO_PAYMENT: Record<number, string> = {
  7: 'draft',
  8: 'open',
  9: 'paid',
  10: 'overdue',
  16: 'cancelled',
  17: 'partially_paid',
};

'use server';

import { createClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface CompanySettingsPayload {
  company_name: string;
  address: string;
  email: string;
  phone: string;
  iban: string;
  vat_number: string;
  logo_url?: string | null;
}

/**
 * Fetch current company settings (first row).
 */
export async function getCompanySettings() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Fetch company_settings error:', error);
    return { success: false as const, error: error.message, data: null };
  }

  return { success: true as const, data };
}

/**
 * Upsert company settings (update the existing row, or insert if none).
 */
export async function updateCompanySettings(payload: CompanySettingsPayload) {
  // Basic validation
  if (!payload.company_name?.trim()) {
    return { success: false, error: 'Le nom de l\'entreprise est requis.' };
  }

  const supabase = createClient();

  // Check if a row exists
  const { data: existing } = await supabase
    .from('company_settings')
    .select('id')
    .limit(1)
    .single();

  if (existing) {
    // Update existing row
    const { error } = await supabase
      .from('company_settings')
      .update({
        company_name: payload.company_name.trim(),
        address: payload.address.trim(),
        email: payload.email.trim(),
        phone: payload.phone.trim(),
        iban: payload.iban.trim(),
        vat_number: payload.vat_number.trim(),
        logo_url: payload.logo_url?.trim() || null,
      })
      .eq('id', existing.id);

    if (error) {
      console.error('Update company_settings error:', error);
      return { success: false, error: 'Erreur lors de la sauvegarde.' };
    }
  } else {
    // Insert new row
    const { error } = await supabase
      .from('company_settings')
      .insert({
        company_name: payload.company_name.trim(),
        address: payload.address.trim(),
        email: payload.email.trim(),
        phone: payload.phone.trim(),
        iban: payload.iban.trim(),
        vat_number: payload.vat_number.trim(),
        logo_url: payload.logo_url?.trim() || null,
      });

    if (error) {
      console.error('Insert company_settings error:', error);
      return { success: false, error: 'Erreur lors de la création.' };
    }
  }

  revalidatePath('/admin/settings');
  return { success: true };
}

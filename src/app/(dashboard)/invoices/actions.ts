'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { InvoiceStatus } from '@/types/database';

const VALID_STATUSES: InvoiceStatus[] = ['generated', 'sent', 'paid'];

export async function updateInvoiceStatus(invoiceId: string, newStatus: InvoiceStatus) {
  if (!invoiceId || !VALID_STATUSES.includes(newStatus)) {
    return { success: false, error: 'Paramètres invalides' };
  }

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('invoices')
    .update({ status: newStatus })
    .eq('id', invoiceId);

  if (error) {
    console.error('Erreur mise à jour statut facture:', error);
    return { success: false, error: 'Erreur lors de la mise à jour' };
  }

  revalidatePath('/invoices');
  return { success: true };
}

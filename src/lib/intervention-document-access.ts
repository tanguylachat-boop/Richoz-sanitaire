import { createClient } from '@/lib/supabase/server';
import { uuidPattern } from '@/lib/chantier-documents';

export const documentFailure = (message: string, status: number) => Response.json({ error: message }, { status });

export type DocumentIntervention = {
  id: string; title: string | null; address: string | null; technician_id: string | null; intervention_type: string;
};

// Staff (admin/secretary) read and manage; the assigned technician only reads.
// Mirrors public.can_access_chantier_document (00043), which Storage enforces too.
export async function interventionDocumentAccess(id: string, write: boolean) {
  if (!uuidPattern.test(id)) return { response: documentFailure('Intervention introuvable.', 404) };
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: documentFailure('Connexion requise.', 401) };
  const { data: profile } = await supabase.from('users').select('role, is_active').eq('id', user.id).single<{ role: string; is_active: boolean }>();
  const canManage = !!profile?.is_active && ['admin', 'secretary'].includes(profile.role);
  if (!profile?.is_active || (write && !canManage)) return { response: documentFailure('Accès refusé.', 403) };
  const { data: intervention } = await supabase.from('interventions')
    .select('id, title, address, technician_id, intervention_type').eq('id', id).single<DocumentIntervention>();
  if (!intervention || (!canManage && intervention.technician_id !== user.id)) {
    return { response: documentFailure('Intervention inaccessible.', 403) };
  }
  return { supabase, canManage, intervention, userId: user.id };
}


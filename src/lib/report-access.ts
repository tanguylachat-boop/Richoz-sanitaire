import { createClient } from '@/lib/supabase/server';

// Authorize with the request session before creating a privileged export client.
export async function reportAccessFailure(id: string, writing: boolean): Promise<Response | null> {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
    const { data: profile, error: profileError } = await supabase.from('users')
      .select('role, is_active').eq('id', user.id)
      .single<{ role: string; is_active: boolean }>();
    if (profileError || !profile?.is_active) return Response.json({ error: 'Accès refusé.' }, { status: 403 });
    const staff = ['admin', 'secretary'].includes(profile.role);
    if (!staff && (writing || profile.role !== 'technician')) {
      return Response.json({ error: 'Accès refusé.' }, { status: 403 });
    }
    const { data: report, error } = await supabase.from('reports')
      .select('id, technician_id').eq('id', id).single<{ id: string; technician_id: string }>();
    if (error || !report || (!staff && report.technician_id !== user.id)) {
      return Response.json({ error: 'Rapport inaccessible.' }, { status: 403 });
    }
    return null;
  } catch {
    return Response.json({ error: 'Vérification des droits impossible.' }, { status: 503 });
  }
}

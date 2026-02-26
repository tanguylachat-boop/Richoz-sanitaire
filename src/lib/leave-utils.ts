import { createClient } from '@/lib/supabase/client';

/**
 * Vérifie si un technicien est en congé à une date donnée
 */
export async function isTechnicianOnLeave(
  technicianId: string,
  date: string // format 'YYYY-MM-DD'
): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('technician_id', technicianId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1);

  if (error) {
    console.error('Error checking leave:', error);
    return false;
  }

  return (data?.length || 0) > 0;
}

/**
 * Récupère tous les congés approuvés pour une période donnée
 * Utile pour afficher dans le calendrier
 */
export async function getApprovedLeaves(
  startDate: string, // format 'YYYY-MM-DD'
  endDate: string
): Promise<{
  technician_id: string;
  start_date: string;
  end_date: string;
  technician?: { first_name: string | null; last_name: string | null };
}[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      technician_id, start_date, end_date,
      technician:users!leave_requests_technician_id_fkey(first_name, last_name)
    `)
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  if (error) {
    console.error('Error fetching approved leaves:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupère les techniciens disponibles (pas en congé) pour une date donnée
 * Retourne la liste des IDs des techniciens en congé
 */
export async function getTechniciansOnLeave(
  date: string // format 'YYYY-MM-DD'
): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select('technician_id')
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date);

  if (error) {
    console.error('Error fetching technicians on leave:', error);
    return [];
  }

  return data?.map(d => d.technician_id) || [];
}
import { createClient } from '@/lib/supabase/server';
import { dailyPeriod, zurichToday } from '@/lib/daily-activity';
import { loadDailyActivity } from '@/lib/daily-activity-data';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
export async function GET(request: Request) {
  try {
    const db = createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Connexion requise.' }, { status: 401, headers });
    const { data: profile, error: profileError } = await db.from('users').select('role,is_active').eq('id', user.id).single();
    if (profileError || !profile?.is_active || !['admin', 'secretary'].includes(profile.role)) {
      return Response.json({ error: 'Bilan réservé aux responsables et secrétaires actifs.' }, { status: 403, headers });
    }
    const params = new URL(request.url).searchParams;
    const date = params.get('date') ?? zurichToday();
    const technician = params.get('technician') || '';
    try {
      dailyPeriod(date);
      if (technician && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(technician)) throw new Error('Technicien invalide.');
    } catch { return Response.json({ error: 'Date ou filtre invalide.' }, { status: 400, headers }); }
    return Response.json(await loadDailyActivity(db, date, technician), { headers });
  } catch {
    return Response.json({ error: 'Impossible de charger le bilan complet. Réessayez.' }, { status: 503, headers });
  }
}

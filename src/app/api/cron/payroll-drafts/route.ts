import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LOT 6C — génération du brouillon de paie du 25 (fenêtre 26 → 25).
// Volontairement absent de vercel.json : AUCUNE planification activée sans
// accord explicite du client (heure de génération et de clôture à définir).
// POST uniquement, secret dédié, simulation par défaut — même modèle que
// /api/cron/report-reminders.
export async function POST(request: Request) {
  const secret = process.env.PAYROLL_DRAFTS_SECRET;
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ error: 'Accès refusé.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const dry = body.simulation !== false;
    if (!dry && process.env.PAYROLL_DRAFTS_ENABLED !== 'true') {
      return Response.json({ error: 'Automatisation désactivée.' }, { status: 409 });
    }
    // Date de référence : fournie par l'appel (tests) ou date du jour Zurich.
    const reference = typeof body.reference === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.reference)
      ? body.reference
      : new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
    const { data, error } = await createClient().rpc('generate_payroll_drafts', {
      p_reference: reference, p_dry: dry,
    });
    if (error) return Response.json({ error: 'Génération non confirmée. Aucune transaction partielle validée.' }, { status: 503 });
    return Response.json(data);
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}

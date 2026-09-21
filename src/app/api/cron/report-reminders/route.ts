import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deliberately absent from vercel.json. POST only, separate secret, default simulation.
export async function POST(request: Request) {
  const secret = process.env.REPORT_REMINDERS_SECRET;
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ error: 'Accès refusé.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const dry = body.simulation !== false;
    if (!dry && process.env.REPORT_REMINDERS_ENABLED !== 'true') {
      return Response.json({ error: 'Automatisation désactivée.' }, { status: 409 });
    }
    // Rules come only from server configuration; request cannot override activation/history cutoff.
    const config = JSON.parse(process.env.REPORT_REMINDERS_CONFIG || 'null') as Json;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return Response.json({ error: 'Paramètres métier non configurés.' }, { status: 409 });
    }
    const { data, error } = await createClient().rpc('run_report_reminders', {
      p_config: { ...config, enabled: !dry }, p_dry: dry,
    });
    if (error) return Response.json({ error: 'Traitement non confirmé. Aucune transaction partielle validée.' }, { status: 503 });
    return Response.json(data);
  } catch {
    return Response.json({ error: 'Requête ou configuration invalide.' }, { status: 400 });
  }
}

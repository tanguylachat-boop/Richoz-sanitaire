import { createClient } from '@/lib/supabase/server';
import { CHANTIER_DOCUMENT_BUCKET, PDF_MAX_BYTES, uuidPattern, safePdfName, documentKeyValid, validatePdf } from '@/lib/chantier-documents';

export const dynamic = 'force-dynamic';
type Context = { params: { id: string } };
const failure = (message: string, status: number) => Response.json({ error: message }, { status });

async function access(id: string, write: boolean) {
  if (!uuidPattern.test(id)) return { response: failure('Chantier introuvable.', 404) };
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: failure('Connexion requise.', 401) };
  const { data: profile } = await supabase.from('users').select('role, is_active').eq('id', user.id).single<{ role: string; is_active: boolean }>();
  const canManage = !!profile?.is_active && ['admin', 'secretary'].includes(profile.role);
  if (!profile?.is_active || (write && !canManage)) return { response: failure('Accès refusé.', 403) };
  const { data: chantier } = await supabase.from('interventions').select('id, technician_id, intervention_type').eq('id', id).single<{ id: string; technician_id: string | null; intervention_type: string }>();
  if (!chantier || chantier.intervention_type !== 'chantier' || (!canManage && chantier.technician_id !== user.id)) {
    return { response: failure('Chantier inaccessible.', 403) };
  }
  return { supabase, canManage };
}

export async function GET(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, false);
    if (a.response) return a.response;
    const bucket = a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET);
    const key = new URL(request.url).searchParams.get('key');
    if (key !== null) {
      if (!documentKeyValid(key)) return failure('Document invalide.', 400);
      const { data, error } = await bucket.download(`${params.id}/${key}`);
      if (error || !data) return failure('Document inaccessible.', 404);
      return new Response(data, { headers: {
        'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${key.slice(38)}"`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    const documents = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(params.id, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) return failure('Impossible de charger les PDF. Réessayez.', 503);
      documents.push(...data.filter(d => documentKeyValid(d.name)).map(d => ({ key: d.name, name: d.name.slice(38) })));
      if (data.length < 100) break;
    }
    return Response.json({ documents, canManage: a.canManage }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return failure('Impossible de charger les PDF. Réessayez.', 503); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, true);
    if (a.response) return a.response;
    if (Number(request.headers.get('content-length')) > PDF_MAX_BYTES + 65536) return failure('PDF trop volumineux (20 Mio maximum).', 413);
    const form = await request.formData();
    const file = form.get('file');
    const token = String(form.get('token'));
    if (!file || typeof file === 'string' || !uuidPattern.test(token)) return failure('Fichier ou identifiant invalide.', 400);
    try { await validatePdf(file); } catch (e) { return failure((e as Error).message, 400); }
    const key = `${token}--${safePdfName(file.name)}`;
    const path = `${params.id}/${key}`;
    const bucket = a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET);
    const { data, error } = await bucket.upload(path, file, { contentType: 'application/pdf', upsert: false });
    // A retry with the same token recovers an upload whose response was lost.
    if (error) {
      const previous = await bucket.download(path);
      if (previous.error || !previous.data || previous.data.size !== file.size ||
          !Buffer.from(await previous.data.arrayBuffer()).equals(Buffer.from(await file.arrayBuffer()))) {
        return failure('PDF non enregistré. Réessayez cet envoi.', 503);
      }
    } else if (!data?.path) return failure('Enregistrement du PDF non confirmé.', 503);
    return Response.json({ document: { key, name: key.slice(38) } });
  } catch { return failure('PDF non enregistré. Réessayez cet envoi.', 503); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, true);
    if (a.response) return a.response;
    const key = new URL(request.url).searchParams.get('key') || '';
    if (!documentKeyValid(key)) return failure('Document invalide.', 400);
    const { error } = await a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET).remove([`${params.id}/${key}`]);
    if (error) return failure('Suppression impossible. Réessayez.', 503);
    return Response.json({ ok: true });
  } catch { return failure('Suppression impossible. Réessayez.', 503); }
}

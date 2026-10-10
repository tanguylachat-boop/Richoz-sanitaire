import { CHANTIER_DOCUMENT_BUCKET, PDF_MAX_BYTES, uuidPattern, safePdfName, documentKeyValid, validatePdf, storePdfOnce } from '@/lib/chantier-documents';
import { interventionDocumentAccess as access, documentFailure as failure } from '@/lib/intervention-document-access';

export const dynamic = 'force-dynamic';
type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, false);
    if (a.response) return a.response;
    const bucket = a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET);
    const key = new URL(request.url).searchParams.get('key');
    if (key !== null) {
      if (!documentKeyValid(key)) return failure('Document invalide.', 400);
      // Short-lived signed URL instead of streaming: Vercel Functions cap response
      // bodies at 4.5 MB, PDFs go up to 20 MiB. Storage RLS still applies to the signing.
      const { data, error } = await bucket.createSignedUrl(`${params.id}/${key}`, 60);
      if (error || !data?.signedUrl) return failure('Document inaccessible.', 404);
      return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' } });
    }
    const documents = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(params.id, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) return failure('Impossible de charger les PDF. Réessayez.', 503);
      documents.push(...data.filter(d => documentKeyValid(d.name)).map(d => ({ key: d.name, name: d.name.slice(38) })));
      if (data.length < 100) break;
    }
    return Response.json({ documents, canManage: a.canManage }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { console.error('documents GET', e); return failure('Impossible de charger les PDF. Réessayez.', 503); }
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
    const stored = await storePdfOnce(a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET), `${params.id}/${key}`, file);
    if (!stored) return failure('PDF non enregistré. Réessayez cet envoi.', 503);
    return Response.json({ document: { key, name: key.slice(38) } });
  } catch (e) { console.error('documents POST', e); return failure('PDF non enregistré. Réessayez cet envoi.', 503); }
}

// Tells the assigned technician that PDFs were added to an existing intervention.
// Called once per batch by the documents panel (not at creation: the
// "nouvelle intervention assignée" notification already covers it).
export async function PATCH(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, true);
    if (a.response) return a.response;
    const body: unknown = await request.json().catch(() => null);
    const count = typeof body === 'object' && body && 'count' in body ? Number((body as { count: unknown }).count) : 0;
    if (!Number.isInteger(count) || count < 1 || count > 100) return failure('Nombre de PDF invalide.', 400);
    const iv = a.intervention!;
    if (!iv.technician_id) return Response.json({ notified: false });
    const isChantier = iv.intervention_type === 'chantier';
    const title = count > 1 ? `${count} nouveaux PDF` : 'Nouveau PDF';
    const message = `${iv.title || 'Intervention'}${iv.address ? ` — ${iv.address}` : ''}`;
    const { error } = await a.supabase!.from('notifications').insert({
      recipient_id: iv.technician_id, sender_id: a.userId, title, message, type: 'documents_added',
      reference_id: iv.id, reference_type: isChantier ? 'chantier' : 'intervention',
    } as never);
    if (error) return failure('Notification non envoyée.', 503);
    return Response.json({ notified: true, recipient_id: iv.technician_id, title, message,
      url: isChantier ? `/technician/chantier/${iv.id}` : `/technician/report/${iv.id}` });
  } catch (e) { console.error('documents PATCH', e); return failure('Notification non envoyée.', 503); }
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
  } catch (e) { console.error('documents DELETE', e); return failure('Suppression impossible. Réessayez.', 503); }
}

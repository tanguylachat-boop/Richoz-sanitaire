import { CHANTIER_DOCUMENT_BUCKET, EMAIL_ATTACHMENT_BUCKET, PDF_MAX_BYTES, uuidPattern, emailAttachmentPath, emailAttachmentName, storePdfOnce } from '@/lib/chantier-documents';
import { interventionDocumentAccess as access, documentFailure as failure } from '@/lib/intervention-document-access';

export const dynamic = 'force-dynamic';
type Context = { params: { id: string } };

// Copies ONE PDF already attached to an inbox email into the intervention's
// private documents. The URL must belong to that email (no arbitrary fetch).
export async function POST(request: Request, { params }: Context) {
  try {
    const a = await access(params.id, true);
    if (a.response) return a.response;
    const body: unknown = await request.json().catch(() => null);
    const { emailId, url, token } = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
    if (typeof emailId !== 'string' || !uuidPattern.test(emailId) || typeof url !== 'string' ||
        typeof token !== 'string' || !uuidPattern.test(token)) return failure('Pièce jointe invalide.', 400);
    const path = emailAttachmentPath(url, process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (!path) return failure('Seuls les PDF reçus par email peuvent être rattachés.', 400);
    const { data: email } = await a.supabase!.from('email_inbox').select('attachment_urls').eq('id', emailId)
      .single<{ attachment_urls: string[] | null }>();
    if (!email?.attachment_urls?.includes(url)) return failure('Cette pièce jointe n’appartient pas à cet email.', 400);
    const { data: source, error } = await a.supabase!.storage.from(EMAIL_ATTACHMENT_BUCKET).download(path);
    if (error || !source) return failure('PDF de l’email introuvable.', 404);
    if (!source.size || source.size > PDF_MAX_BYTES) return failure('Le PDF doit contenir entre 1 octet et 20 Mio.', 400);
    if (await source.slice(0, 5).text() !== '%PDF-') return failure('Le contenu du fichier ne correspond pas à un PDF.', 400);
    const pdf = new Blob([await source.arrayBuffer()], { type: 'application/pdf' });
    const key = `${token}--${emailAttachmentName(url)}`;
    const stored = await storePdfOnce(a.supabase!.storage.from(CHANTIER_DOCUMENT_BUCKET), `${params.id}/${key}`, pdf);
    if (!stored) return failure('PDF non enregistré. Réessayez.', 503);
    return Response.json({ document: { key, name: key.slice(38) } });
  } catch (e) { console.error('documents from-email POST', e); return failure('PDF non enregistré. Réessayez.', 503); }
}

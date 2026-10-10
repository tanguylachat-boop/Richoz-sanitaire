// Same PDF size limit as the existing documents bucket (00001).
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const CHANTIER_DOCUMENT_BUCKET = 'chantier-documents';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safePdfName(name: string) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^[. ]+/, '').slice(0, 120).trim();
  return `${base || 'document'}.pdf`;
}
export function documentKeyValid(key: string) {
  return uuidPattern.test(key.slice(0, 36)) && key.slice(36, 38) === '--' &&
    key.slice(38) === safePdfName(key.slice(38));
}
export async function validatePdf(file: File) {
  if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') throw new Error('Sélectionnez un fichier PDF.');
  if (!file.size || file.size > PDF_MAX_BYTES) throw new Error('Le PDF doit contenir entre 1 octet et 20 Mio.');
  if (await file.slice(0, 5).text() !== '%PDF-') throw new Error('Le contenu du fichier ne correspond pas à un PDF.');
}

// Email attachments are stored by the Gmail ingestion in the `documents` bucket
// as email-attachments/<timestamp>_<index>_<original name>.
export const EMAIL_ATTACHMENT_BUCKET = 'documents';
const EMAIL_ATTACHMENT_PATH = /^email-attachments\/[^/]+\.pdf$/i;
export function emailAttachmentPath(url: string, supabaseUrl: string) {
  const prefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${EMAIL_ATTACHMENT_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  let path: string;
  try { path = decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch { return null; }
  return EMAIL_ATTACHMENT_PATH.test(path) ? path : null;
}
export function emailAttachmentName(url: string) {
  let last = url.split('?')[0].split('/').pop() || '';
  try { last = decodeURIComponent(last); } catch { /* keep raw segment */ }
  return safePdfName(last.replace(/^\d+_\d+_/, ''));
}
export function emailPdfUrls(urls: string[] | null | undefined) {
  return (urls || []).filter(url => /\.pdf$/i.test(url.split('?')[0]));
}

type DocumentBucket = {
  upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): Promise<{ data: { path: string } | null; error: unknown }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
};
async function sameBytes(a: Blob, b: Blob) {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then(r => r.map(buf => new Uint8Array(buf)));
  return x.every((v, i) => v === y[i]);
}
// Upload without overwrite (no UPDATE policy). A retry with the same token
// recovers an upload whose response was lost: identical bytes count as success.
export async function storePdfOnce(bucket: DocumentBucket, path: string, file: Blob) {
  const { data, error } = await bucket.upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (!error) return !!data?.path;
  const previous = await bucket.download(path);
  return !previous.error && !!previous.data && await sameBytes(previous.data, file);
}
// Browser → Storage directly (RLS 00043 enforces staff + path format). Avoids the
// 4.5 MB request body limit of Vercel Functions for PDFs up to 20 MiB.
export async function uploadInterventionPdf(
  storage: { from(bucket: string): DocumentBucket }, interventionId: string, file: File, token: string,
) {
  await validatePdf(file);
  if (!uuidPattern.test(interventionId) || !uuidPattern.test(token)) throw new Error('Identifiant invalide.');
  const key = `${token}--${safePdfName(file.name)}`;
  if (!await storePdfOnce(storage.from(CHANTIER_DOCUMENT_BUCKET), `${interventionId}/${key}`, file)) {
    throw new Error('PDF non enregistré. Réessayez cet envoi.');
  }
  return { key, name: key.slice(38) };
}

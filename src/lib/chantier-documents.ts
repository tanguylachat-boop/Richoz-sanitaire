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

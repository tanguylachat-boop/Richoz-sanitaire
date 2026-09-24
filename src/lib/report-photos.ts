export const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // Existing photos bucket limit.
export type ReportPhoto = {
  url: string; caption?: string; file?: File; isLocal?: boolean;
  uploadPath?: string; uploaded?: boolean; error?: string;
};
export function validatePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) {
    throw new Error('Format accepté : JPEG, PNG, WebP ou HEIC (si lisible par cet appareil).');
  }
  if (!file.size || file.size > PHOTO_MAX_BYTES) throw new Error('Photo vide ou trop volumineuse (10 Mio maximum).');
}
export function reportPhotoUrl(path: string) {
  return `/api/report-photos?path=${encodeURIComponent(path)}`;
}
export function privateReportPhotoPath(url: string) {
  if (!url.startsWith('/api/report-photos?')) return null;
  const path = new URLSearchParams(url.split('?')[1]).get('path');
  return path && /^[0-9a-f-]{36}\/reports\/[0-9a-f-]{36}\/(before|after)\/[0-9a-f-]{36}\.jpg$/i.test(path) ? path : null;
}
// Progress is saved back after EACH upload, even if another file or report write fails.
export async function uploadReportPhotos(
  photos: ReportPhoto[], category: string, owner: string, intervention: string,
  storage: { upload: Function; download: Function },
  update: (photos: ReportPhoto[]) => void,
) {
  const next = photos.map(p => ({ ...p }));
  for (const photo of next) {
    if (!photo.isLocal || photo.uploaded || !photo.file) continue;
    photo.uploadPath ||= `${owner}/reports/${intervention}/${category}/${crypto.randomUUID()}.jpg`;
    update(next.map(p => ({ ...p })));
    try {
      validatePhoto(photo.file);
      const { data, error } = await storage.upload(photo.uploadPath, photo.file, { upsert: false, contentType: photo.file.type });
      if (error) {
        // Lost response: accept the immutable existing object only if bytes match.
        const stored = await storage.download(photo.uploadPath);
        if (stored.error || !stored.data || stored.data.size !== photo.file.size) throw new Error();
        const left = new Uint8Array(await stored.data.arrayBuffer());
        const right = new Uint8Array(await photo.file.arrayBuffer());
        if (!left.every((b, i) => b === right[i])) throw new Error();
      } else if (!data?.path) throw new Error();
      photo.uploaded = true; photo.error = undefined;
    } catch { photo.error = 'Envoi échoué — réessayez l’enregistrement.'; }
    update(next.map(p => ({ ...p })));
  }
  return {
    failed: next.filter(p => p.isLocal && !p.uploaded).length,
    photos: next.map(p => ({ url: p.uploaded && p.uploadPath ? reportPhotoUrl(p.uploadPath) : p.url, caption: p.caption, category })),
  };
}

// Photos des bons de commande fournisseur. Réutilise le bucket 'photos' et le
// même schéma de sécurité que les rapports (lot 6) : chemin préfixé par l'uid,
// 2e segment 'supplier-orders' (autorisé par report_photo_scope, 00028), lecture
// via une route API privée. Calqué sur report-photos.ts.
import { validatePhoto } from './report-photos';

export type OrderPhoto = {
  url: string; file?: File; isLocal?: boolean;
  uploadPath?: string; uploaded?: boolean; error?: string;
};

export function orderPhotoUrl(path: string) {
  return `/api/supplier-order-photos?path=${encodeURIComponent(path)}`;
}

export function privateOrderPhotoPath(url: string) {
  if (!url.startsWith('/api/supplier-order-photos?')) return null;
  const path = new URLSearchParams(url.split('?')[1]).get('path');
  return path && /^[0-9a-f-]{36}\/supplier-orders\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path) ? path : null;
}

// Envoie chaque photo locale ; renvoie les URLs privées à stocker en base.
export async function uploadOrderPhotos(
  photos: OrderPhoto[], owner: string, intervention: string,
  storage: { upload: Function; download: Function },
  update: (photos: OrderPhoto[]) => void,
) {
  const next = photos.map((p) => ({ ...p }));
  for (const photo of next) {
    if (!photo.isLocal || photo.uploaded || !photo.file) continue;
    photo.uploadPath ||= `${owner}/supplier-orders/${intervention}/${crypto.randomUUID()}.jpg`;
    update(next.map((p) => ({ ...p })));
    try {
      validatePhoto(photo.file);
      const { data, error } = await storage.upload(photo.uploadPath, photo.file, { upsert: false, contentType: photo.file.type });
      if (error) {
        // Réponse perdue : accepter l'objet immuable existant seulement si les octets correspondent.
        const stored = await storage.download(photo.uploadPath);
        if (stored.error || !stored.data || stored.data.size !== photo.file.size) throw new Error();
        const left = new Uint8Array(await stored.data.arrayBuffer());
        const right = new Uint8Array(await photo.file.arrayBuffer());
        if (!left.every((b, i) => b === right[i])) throw new Error();
      } else if (!data?.path) throw new Error();
      photo.uploaded = true; photo.error = undefined;
    } catch { photo.error = 'Envoi échoué — réessayez l’enregistrement.'; }
    update(next.map((p) => ({ ...p })));
  }
  return {
    failed: next.filter((p) => p.isLocal && !p.uploaded).length,
    photos: next.map((p) => ({ url: p.uploaded && p.uploadPath ? orderPhotoUrl(p.uploadPath) : p.url })),
  };
}

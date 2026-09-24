'use client';

import { useRef, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Camera, X, Plus } from 'lucide-react';
import { normalizeImage } from '@/lib/normalize-image';
import { validatePhoto, type ReportPhoto as Photo } from '@/lib/report-photos';

interface PhotoUploaderProps {
  interventionId: string;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  onProcessingChange?: (processing: boolean) => void;
}

export function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 10,
  disabled = false,
  onProcessingChange,
}: PhotoUploaderProps) {
  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [processing, setProcessing] = useState(false);
  const processingLock = useRef(false);
  const latest = useRef(photos);
  latest.current = photos;
  const ownedUrls = useRef(new Set<string>());
  useEffect(() => () => { ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || disabled || processingLock.current) return;
    processingLock.current = true; setProcessing(true); onProcessingChange?.(true);
    const newPhotos: Photo[] = [];
    try {
      for (const file of files) {
        if (latest.current.length + newPhotos.length >= maxPhotos) {
          toast.error(`${file.name} : maximum ${maxPhotos} photos dans cette catégorie.`);
          continue;
        }
        try {
          validatePhoto(file);
          const normalized = await normalizeImage(file);
          validatePhoto(normalized);
          const url = URL.createObjectURL(normalized);
          ownedUrls.current.add(url);
          newPhotos.push({ url, file: normalized, isLocal: true });
        } catch (error) {
          toast.error(`${file.name} : ${error instanceof Error ? error.message : 'Image illisible sur cet appareil.'}`);
        }
      }
      onPhotosChange([...latest.current, ...newPhotos]);
      if (newPhotos.length) toast.info(`${newPhotos.length} photo(s) prête(s). Enregistrez le rapport pour les conserver.`);
    } finally {
      processingLock.current = false; setProcessing(false); onProcessingChange?.(false);
    }
  };

  // Remove a photo
  const removePhoto = (index: number) => {
    if (disabled || processingLock.current) return;
    const photoToRemove = photos[index];
    
    // Revoke blob URL if local
    if (photoToRemove.isLocal && photoToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(photoToRemove.url);
      ownedUrls.current.delete(photoToRemove.url);
    }
    
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    toast.success('Photo supprimée');
  };

  return (
    <div className="space-y-4">
      {/* Photo Grid - SIMPLE */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, index) => (
            <div
              key={index}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
            >
              {/* IMAGE SIMPLE - Pas de conditions compliquées */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Delete button */}
              <button
                type="button"
                disabled={disabled || processing}
                aria-label={`Retirer la photo ${index + 1}`}
                onClick={() => removePhoto(index)}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Number badge */}
              <div className="absolute top-2 left-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                <span className="text-xs text-white font-bold">{index + 1}</span>
              </div>

              {/* Local badge */}
              {photo.isLocal && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-amber-500 rounded text-[10px] text-white font-medium">
                  {photo.error || (photo.uploaded ? 'Envoyée — rapport à enregistrer' : 'À envoyer')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Photo Button - SIMPLE */}
      {photos.length < maxPhotos && (
        <label className="block">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            disabled={disabled || processing}
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">
                  Ajouter des photos
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Cliquez ou appuyez ici
                </p>
              </div>
            </div>
          </div>
        </label>
      )}

      {processing && <p role="status">Préparation des photos…</p>}
      {/* Counter */}
      <p className="text-sm text-gray-500 text-center">
        {photos.length} / {maxPhotos} photos
      </p>
    </div>
  );
}

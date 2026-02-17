'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Camera, X, Plus } from 'lucide-react';

interface Photo {
  url: string;
  file?: File;
  caption?: string;
  isLocal?: boolean;
}

interface PhotoUploaderProps {
  interventionId: string;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  maxPhotos?: number;
}

export function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 10,
}: PhotoUploaderProps) {
  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection - ULTRA SIMPLE
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos`);
      return;
    }

    const newPhotos: Photo[] = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Créer l'URL locale IMMÉDIATEMENT
      const objectUrl = URL.createObjectURL(file);
      
      newPhotos.push({
        url: objectUrl,
        file: file,
        isLocal: true,
      });
    }

    // Update state with new photos
    onPhotosChange([...photos, ...newPhotos]);
    toast.success(`${files.length} photo(s) ajoutée(s)`);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove a photo
  const removePhoto = (index: number) => {
    const photoToRemove = photos[index];
    
    // Revoke blob URL if local
    if (photoToRemove.isLocal && photoToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(photoToRemove.url);
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
                  Non uploadé
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
            accept="image/*"
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

      {/* Counter */}
      <p className="text-sm text-gray-500 text-center">
        {photos.length} / {maxPhotos} photos
      </p>
    </div>
  );
}

/**
 * Normalize image orientation by re-encoding through Canvas.
 * Modern browsers auto-apply EXIF rotation when drawing to canvas,
 * so the output JPEG will always be correctly oriented regardless
 * of the original EXIF orientation tag.
 *
 * Also caps the image dimensions to maxSize to avoid uploading
 * unnecessarily large files from phone cameras.
 */
export async function normalizeImage(
  file: File,
  { maxSize = 2048, quality = 0.85 }: { maxSize?: number; quality?: number } = {}
): Promise<File> {
  // Only process images
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if needed
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const normalized = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(normalized);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));

    // createObjectURL + Image auto-applies EXIF orientation in modern browsers
    img.src = URL.createObjectURL(file);
  });
}

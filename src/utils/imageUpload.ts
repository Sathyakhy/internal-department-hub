export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  preserveTransparency?: boolean;
}

export async function readAndOptimizeImage(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<string> {
  const {
    maxWidth = 640,
    maxHeight = 640,
    quality = 0.88,
    preserveTransparency = false,
  } = options;

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image file.'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  // Preserve SVG vector logos directly
  if (file.type === 'image/svg+xml') {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= 0 || height <= 0) {
        resolve(rawDataUrl);
        return;
      }

      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const usePng =
        preserveTransparency || file.type === 'image/png' || file.type === 'image/webp';
      const outputMime = usePng ? 'image/png' : 'image/jpeg';
      try {
        const result = canvas.toDataURL(outputMime, quality);
        resolve(result);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

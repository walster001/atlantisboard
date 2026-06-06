/**
 * Downscales large raster images before upload so homepage backgrounds stay reasonable in size.
 * SVG is returned unchanged.
 */
const DEFAULT_MAX_EDGE = 2400;

export async function resizeImageForBackgroundUpload(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE
): Promise<File> {
  if (file.type === 'image/svg+xml') {
    return file;
  }
  if (!file.type.startsWith('image/')) {
    return file;
  }

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const w = bmp.width;
    const h = bmp.height;
    if (w <= maxEdge && h <= maxEdge) {
      return file;
    }
    const scale = maxEdge / Math.max(w, h);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bmp, 0, 0, tw, th);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });
    if (!blob) {
      return file;
    }
    const base = file.name.replace(/\.[^.]+$/, '') || 'background';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    bmp.close();
  }
}

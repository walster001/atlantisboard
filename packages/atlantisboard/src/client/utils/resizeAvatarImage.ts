const AVATAR_PX = 256;

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/**
 * Center-crop scales the image to a square, then encodes as WebP (JPEG fallback).
 */
export async function resizeImageToSquareAvatarBlob(
  file: File
): Promise<{ blob: Blob; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }
    const scale = Math.max(AVATAR_PX / bitmap.width, AVATAR_PX / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const dx = (AVATAR_PX - w) / 2;
    const dy = (AVATAR_PX - h) / 2;
    ctx.drawImage(bitmap, dx, dy, w, h);

    const webp = await blobFromCanvas(canvas, 'image/webp', 0.88);
    if (webp) {
      return { blob: webp, mimeType: 'image/webp' };
    }
    const jpeg = await blobFromCanvas(canvas, 'image/jpeg', 0.88);
    if (!jpeg) {
      throw new Error('Could not encode image');
    }
    return { blob: jpeg, mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

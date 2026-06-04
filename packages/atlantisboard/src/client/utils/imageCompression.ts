const SKIP_COMPRESS_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 1920;
const QUALITY = 0.82;

/**
 * Downscale large raster attachments before upload. GIF/SVG and very large files are returned unchanged.
 */
export async function maybeCompressImageForAttachment(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size > SKIP_COMPRESS_BYTES) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const outputType =
      file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, QUALITY);
    });
    if (!blob || blob.size >= file.size) {
      return file;
    }
    return new File([blob], file.name, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  }
}

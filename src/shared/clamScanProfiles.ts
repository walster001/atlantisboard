/**
 * ClamAV scan profiles for card attachment MIME types.
 * Keep aligned with allowed types in `attachmentService/upload.ts`.
 */

export type ClamScanProfile = 'media' | 'text' | 'office' | 'pdf';

/** Plain-text attachment MIME types allowed at upload. */
export const CARD_ATTACHMENT_TEXT_MIMES = [
  'text/plain',
  'text/csv',
  'text/markdown',
] as const;

/** Office Open XML attachment MIME types (ZIP + XML containers). */
export const CARD_ATTACHMENT_OFFICE_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

const TEXT_MIME_SET = new Set<string>(CARD_ATTACHMENT_TEXT_MIMES);
const OFFICE_MIME_SET = new Set<string>(CARD_ATTACHMENT_OFFICE_MIMES);

export function normalizeAttachmentMime(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Images, videos, and audio: no embedded archive extraction needed; safe for faster clamscan flags. */
export function isLowRiskMediaMimeType(mimeType: string): boolean {
  const normalized = normalizeAttachmentMime(mimeType);
  return (
    normalized.startsWith('image/') ||
    normalized.startsWith('video/') ||
    normalized.startsWith('audio/')
  );
}

/**
 * Maps upload MIME type to a clamscan profile (clamscan fallback path only).
 * Unknown types fall back to `office` (archive-aware with size/time caps).
 */
export function resolveClamScanProfile(mimeType: string): ClamScanProfile {
  const normalized = normalizeAttachmentMime(mimeType);

  if (isLowRiskMediaMimeType(mimeType)) {
    return 'media';
  }
  if (TEXT_MIME_SET.has(normalized)) {
    return 'text';
  }
  if (normalized === 'application/pdf') {
    return 'pdf';
  }
  if (OFFICE_MIME_SET.has(normalized)) {
    return 'office';
  }
  return 'office';
}

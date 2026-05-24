/**
 * Central upload size limits (server). Multer and service validation must stay aligned
 * so oversized bodies cannot bypass one layer.
 */

/** Default 50 MB; clamp 1–1024 MB via env. */
const CARD_ATTACHMENT_DEFAULT_MB = 50;

/** Upper bound for `CARD_ATTACHMENT_MAX_MB` (1 GiB). */
const CARD_ATTACHMENT_MAX_MB_CEILING = 1024;

/**
 * Multipart requests with `Content-Length` above this use multer disk storage so the file is
 * streamed to the OS temp directory instead of buffering the whole body in RAM. When length is
 * unknown, disk storage is used.
 */
export const CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024;

/** Default 50 MB; clamp 1–1024 MB via env. */
export function getCardAttachmentMaxBytes(): number {
  const parsed = Number.parseInt(process.env.CARD_ATTACHMENT_MAX_MB ?? String(CARD_ATTACHMENT_DEFAULT_MB), 10);
  const mb = Number.isFinite(parsed) ? parsed : CARD_ATTACHMENT_DEFAULT_MB;
  const clamped = Math.min(CARD_ATTACHMENT_MAX_MB_CEILING, Math.max(1, mb));
  return clamped * 1024 * 1024;
}

/**
 * Memory-buffered JSON/CSV imports (Trello/Wekan/CSV). Default 35 MB; clamp 5–250 MB.
 * Must match multer `limits.fileSize` on import routes.
 */
export function getBoardImportUploadMaxBytes(): number {
  const parsed = Number.parseInt(process.env.BOARD_IMPORT_MAX_MB ?? '35', 10);
  const mb = Number.isFinite(parsed) ? parsed : 35;
  const clamped = Math.min(250, Math.max(5, mb));
  return clamped * 1024 * 1024;
}

/**
 * Central upload size limits (server). Multer and service validation must stay aligned
 * so oversized bodies cannot bypass one layer.
 */

import { resolveCardAttachmentMaxBytes } from '../../shared/constants/uploadLimits.js';

/**
 * Multipart requests with `Content-Length` above this use multer disk storage so the file is
 * streamed to the OS temp directory instead of buffering the whole body in RAM. When length is
 * unknown, disk storage is used.
 */
export const CARD_ATTACHMENT_DISK_UPLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024;

/** Card attachment byte cap from `CARD_ATTACHMENT_MAX_MB` or legacy `MAX_FILE_SIZE`. */
export function getCardAttachmentMaxBytes(): number {
  return resolveCardAttachmentMaxBytes({
    CARD_ATTACHMENT_MAX_MB: process.env.CARD_ATTACHMENT_MAX_MB,
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
  });
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

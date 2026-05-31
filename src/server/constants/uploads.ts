/**
 * Central upload size limits (server). Multer and service validation must stay aligned
 * so oversized bodies cannot bypass one layer.
 */

import {
  resolveBoardImportMaxBytes,
  resolveCardAttachmentMaxBytes,
} from '../../shared/constants/uploadLimits.js';

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
  return resolveBoardImportMaxBytes({ BOARD_IMPORT_MAX_MB: process.env.BOARD_IMPORT_MAX_MB });
}

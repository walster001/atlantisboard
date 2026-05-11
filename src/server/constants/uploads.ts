/**
 * Central upload size limits (server). Multer and service validation must stay aligned
 * so oversized bodies cannot bypass one layer.
 */

/** Default 50 MB; clamp 1–500 MB via env to reduce abuse of memory-buffered uploads. */
export function getCardAttachmentMaxBytes(): number {
  const parsed = Number.parseInt(process.env.CARD_ATTACHMENT_MAX_MB ?? '50', 10);
  const mb = Number.isFinite(parsed) ? parsed : 50;
  const clamped = Math.min(500, Math.max(1, mb));
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

/** Default card attachment cap when env is unset (MB). */
export const CARD_ATTACHMENT_DEFAULT_MB = 1024;

/** Upper bound for `CARD_ATTACHMENT_MAX_MB` and legacy `MAX_FILE_SIZE` (4 GiB). */
export const CARD_ATTACHMENT_MAX_MB_CEILING = 4000;

export type CardAttachmentLimitsEnv = {
  readonly CARD_ATTACHMENT_MAX_MB?: string | undefined;
  /** Legacy byte cap (e.g. `1048576000` for 1000 MiB). Used when `CARD_ATTACHMENT_MAX_MB` is unset. */
  readonly MAX_FILE_SIZE?: string | undefined;
};

/**
 * Resolve max card attachment size in bytes from environment.
 * `CARD_ATTACHMENT_MAX_MB` takes precedence over `MAX_FILE_SIZE`.
 */
export function resolveCardAttachmentMaxBytes(env: CardAttachmentLimitsEnv): number {
  const mbRaw = env.CARD_ATTACHMENT_MAX_MB?.trim();
  if (mbRaw !== undefined && mbRaw !== '') {
    const parsed = Number.parseInt(mbRaw, 10);
    const mb = Number.isFinite(parsed) ? parsed : CARD_ATTACHMENT_DEFAULT_MB;
    const clamped = Math.min(CARD_ATTACHMENT_MAX_MB_CEILING, Math.max(1, mb));
    return clamped * 1024 * 1024;
  }

  const bytesRaw = env.MAX_FILE_SIZE?.trim();
  if (bytesRaw !== undefined && bytesRaw !== '') {
    const parsed = Number.parseInt(bytesRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      const ceilingBytes = CARD_ATTACHMENT_MAX_MB_CEILING * 1024 * 1024;
      return Math.min(ceilingBytes, parsed);
    }
  }

  return CARD_ATTACHMENT_DEFAULT_MB * 1024 * 1024;
}

/** Human-readable MB label for UI and error messages (rounded). */
export function formatCardAttachmentMaxMb(maxBytes: number): number {
  return Math.round(maxBytes / (1024 * 1024));
}

/** Default board import cap when env is unset (MB). */
export const BOARD_IMPORT_DEFAULT_MB = 35;

/** Lower bound for `BOARD_IMPORT_MAX_MB`. */
export const BOARD_IMPORT_MIN_MB = 5;

/** Upper bound for `BOARD_IMPORT_MAX_MB`. */
export const BOARD_IMPORT_MAX_MB_CEILING = 250;

export type BoardImportLimitsEnv = {
  readonly BOARD_IMPORT_MAX_MB?: string | undefined;
};

/**
 * Resolve max board import file size in bytes from environment.
 * Clamped to 5–250 MB; default 35 MB.
 */
export function resolveBoardImportMaxBytes(env: BoardImportLimitsEnv): number {
  const parsed = Number.parseInt(env.BOARD_IMPORT_MAX_MB ?? String(BOARD_IMPORT_DEFAULT_MB), 10);
  const mb = Number.isFinite(parsed) ? parsed : BOARD_IMPORT_DEFAULT_MB;
  const clamped = Math.min(BOARD_IMPORT_MAX_MB_CEILING, Math.max(BOARD_IMPORT_MIN_MB, mb));
  return clamped * 1024 * 1024;
}

/** Default admin backup import cap when env is unset (MB). Aligns with card attachment default. */
export const BACKUP_IMPORT_DEFAULT_MB = 1024;

/** Lower bound for `BACKUP_IMPORT_MAX_MB`. */
export const BACKUP_IMPORT_MIN_MB = 10;

/** Upper bound for `BACKUP_IMPORT_MAX_MB` (same ceiling as card attachments). */
export const BACKUP_IMPORT_MAX_MB_CEILING = CARD_ATTACHMENT_MAX_MB_CEILING;

export type BackupImportLimitsEnv = {
  readonly BACKUP_IMPORT_MAX_MB?: string | undefined;
};

/**
 * Resolve max external backup ZIP import size in bytes from environment.
 * Clamped to 10–4000 MB; default 1024 MB.
 */
export function resolveBackupImportMaxBytes(env: BackupImportLimitsEnv): number {
  const parsed = Number.parseInt(env.BACKUP_IMPORT_MAX_MB ?? String(BACKUP_IMPORT_DEFAULT_MB), 10);
  const mb = Number.isFinite(parsed) ? parsed : BACKUP_IMPORT_DEFAULT_MB;
  const clamped = Math.min(BACKUP_IMPORT_MAX_MB_CEILING, Math.max(BACKUP_IMPORT_MIN_MB, mb));
  return clamped * 1024 * 1024;
}

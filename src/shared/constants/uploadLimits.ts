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

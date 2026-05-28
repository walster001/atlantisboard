import {
  formatCardAttachmentMaxMb,
  resolveCardAttachmentMaxBytes,
} from '../../shared/constants/uploadLimits.js';

const LIMITS_META_NAME = 'kanboard-upload-limits';

/** Limits injected by the server in `renderSpaIndexHtml` (kept in sync with multer/service caps). */
export function getClientCardAttachmentMaxBytes(): number {
  if (typeof document !== 'undefined') {
    const raw = document.querySelector(`meta[name="${LIMITS_META_NAME}"]`)?.getAttribute('content');
    if (raw != null && raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw) as { cardAttachmentMaxBytes?: unknown };
        const bytes = parsed.cardAttachmentMaxBytes;
        if (typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0) {
          return bytes;
        }
      } catch {
        // Fall through to shared default resolver
      }
    }
  }
  return resolveCardAttachmentMaxBytes({});
}

export { formatCardAttachmentMaxMb };

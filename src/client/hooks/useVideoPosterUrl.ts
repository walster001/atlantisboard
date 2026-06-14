import { useMemo } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../shared/cardDescriptionAttachmentRefs.js';
import {
  appendAttachmentListCoverPreviewQuery,
  appendVideoPosterPreviewQuery,
} from '../../shared/attachmentPreviewAsset.js';
import { api } from '../utils/api.js';

function toAbsoluteAppUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  }
  return trimmed;
}

function resolveStoredPosterPath(storedPoster: string | undefined): string {
  const trimmed = storedPoster?.trim() ?? '';
  if (trimmed === '') {
    return '';
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId != null) {
    return api.getAttachmentFileUrl(attachmentId);
  }
  const resolved = api.resolveAttachmentUrl(trimmed);
  if (resolved.startsWith('/')) {
    return resolved;
  }
  try {
    const parsed = new URL(resolved);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return resolved;
  }
}

/**
 * Optimised poster URL for video attachments — server-side sharp previews (`?preview=poster`)
 * or stored poster JPEG attachments (`?preview=card`).
 */
export function useVideoPosterUrl(
  storedVideoSrc: string,
  storedPoster: string | undefined,
): string | undefined {
  return useMemo(() => {
    const storedPosterPath = resolveStoredPosterPath(storedPoster);
    if (storedPosterPath !== '') {
      return toAbsoluteAppUrl(appendAttachmentListCoverPreviewQuery(storedPosterPath));
    }

    const attachmentId = extractAttachmentIdFromMediaSrc(storedVideoSrc.trim());
    if (attachmentId != null) {
      return toAbsoluteAppUrl(appendVideoPosterPreviewQuery(api.getAttachmentFileUrl(attachmentId)));
    }

    return undefined;
  }, [storedPoster, storedVideoSrc]);
}

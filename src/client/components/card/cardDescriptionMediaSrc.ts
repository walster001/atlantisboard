import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { api } from '../../utils/api.js';

export function attachmentProxyPath(attachmentId: string): string {
  const fromApi = api.getAttachmentFileUrl(attachmentId);
  if (fromApi.startsWith('/')) {
    return fromApi;
  }
  try {
    const parsed = new URL(fromApi);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fromApi;
  }
}

export function initialCardDescriptionMediaSrc(storedSrc: string): string {
  const trimmed = storedSrc.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId != null) {
    return attachmentProxyPath(attachmentId);
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

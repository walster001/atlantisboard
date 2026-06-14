import { initialCardDescriptionMediaSrc } from '../components/card/cardDescriptionMediaSrc.js';
import { isPendingDescriptionMediaSrc } from './descriptionPendingMedia.js';

/** Resolves description decoration image URLs (cover, inline-button icon) for immediate preview. */
export function resolveDescriptionDecorationImageSrc(src: string | null | undefined): string | null {
  if (src == null) {
    return null;
  }
  const trimmed = src.trim();
  if (trimmed === '') {
    return null;
  }
  if (isPendingDescriptionMediaSrc(trimmed)) {
    return trimmed;
  }
  const resolved = initialCardDescriptionMediaSrc(trimmed);
  return resolved.trim() !== '' ? resolved : null;
}

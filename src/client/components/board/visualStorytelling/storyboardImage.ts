import { isPlaceholderCardAttachment } from '../../../../shared/cardAttachmentPlaceholder.js';
import {
  attachmentScanBlockedMessage,
  isAttachmentViewable,
} from '../../../../shared/attachmentScanStatus.js';
import {
  cardCoverReferencesAttachment,
  extractAttachmentIdFromMediaSrc,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import { formatCardAttachmentMaxMb } from '../../../../shared/constants/uploadLimits.js';
import type { CardDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';

export type StoryboardCardAttachment = NonNullable<CardDB['attachments']>[number];

/**
 * ponytail: lists = sections; first card = hero, later cards = content. Image is the card cover
 * attachment when present, else the first viewable image attachment. Layout should pass `src`
 * from `resolveStoryboardBoardImageUrl` (full file URL, not kanban `preview=card`) and `onClick`
 * → `openCardImage(card)`.
 */
export function isStoryboardImageAttachment(attachment: StoryboardCardAttachment): boolean {
  return (
    !isPlaceholderCardAttachment(attachment) &&
    isAttachmentViewable(attachment.scanStatus) &&
    attachment.type.startsWith('image/')
  );
}

function attachmentFromCoverUrl(
  cover: string,
  title: string | undefined,
): StoryboardCardAttachment | null {
  const id = extractAttachmentIdFromMediaSrc(cover);
  if (id == null) {
    return null;
  }
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const name = trimmedTitle === '' ? 'Image' : trimmedTitle;
  // ponytail: board summary cards omit attachments; cover file URL still has the id for lightbox
  return {
    id,
    name,
    url: cover,
    type: 'image/jpeg',
    size: 0,
    uploadedAt: new Date(0),
    uploadedBy: '',
    scanStatus: 'clean',
  };
}

export function findStoryboardPreviewAttachment(
  card: Pick<CardDB, 'cover' | 'attachments'> & { readonly title?: string },
): StoryboardCardAttachment | null {
  const attachments = card.attachments ?? [];
  const coverMatch = attachments.find(
    (att) =>
      isStoryboardImageAttachment(att) &&
      cardCoverReferencesAttachment(card.cover, att.id, att.url),
  );
  if (coverMatch != null) {
    return coverMatch;
  }
  const firstImage = attachments.find(isStoryboardImageAttachment);
  if (firstImage != null) {
    return firstImage;
  }
  const cover = typeof card.cover === 'string' ? card.cover.trim() : '';
  return cover === '' ? null : attachmentFromCoverUrl(cover, card.title);
}

/** Full-size board `src` (readable). Click still goes through AttachmentPreviewModal. */
export function resolveStoryboardBoardImageUrl(
  card: Pick<CardDB, 'cover' | 'attachments'> & { readonly title?: string },
): string {
  const attachment = findStoryboardPreviewAttachment(card);
  if (attachment != null) {
    return api.getAttachmentFileUrl(attachment.id);
  }
  const cover = typeof card.cover === 'string' ? card.cover.trim() : '';
  return cover === '' ? '' : api.resolveAttachmentUrl(cover);
}

export function validateStoryboardImageFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
  maxBytes: number,
): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Choose an image file.';
  }
  if (file.size > maxBytes) {
    return `File exceeds size limit of ${formatCardAttachmentMaxMb(maxBytes)} MB: ${file.name}`;
  }
  return null;
}

export function storyboardScanBlockMessage(attachment: StoryboardCardAttachment): string {
  if (isPlaceholderCardAttachment(attachment) || isAttachmentViewable(attachment.scanStatus)) {
    return '';
  }
  return attachmentScanBlockedMessage(attachment.scanStatus);
}

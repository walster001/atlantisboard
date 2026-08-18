import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { CardDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import { useAttachmentStreamUrl } from '../../../hooks/useAttachmentStreamUrl.js';
import { isPlaceholderCardAttachment } from '../../../../shared/cardAttachmentPlaceholder.js';
import { isAttachmentViewable } from '../../../../shared/attachmentScanStatus.js';
import { AttachmentPreviewModal } from '../../card/AttachmentPreviewModal.js';
import { buildPreviewModalProps } from '../../card/buildPreviewModalProps.js';
import {
  findStoryboardPreviewAttachment,
  storyboardScanBlockMessage,
  type StoryboardCardAttachment,
} from './storyboardImage.js';

/**
 * ponytail: reuses card-detail AttachmentPreviewModal (the attachment/cover lightbox).
 * Layout: `{lightbox.lightboxNode}` once on the storyboard, `onClick={() => lightbox.openCardImage(card)}`
 * on hero/content images. Do not add a second overlay.
 */
export type UseStoryboardLightboxResult = {
  readonly openCardImage: (card: CardDB) => void;
  readonly closeLightbox: () => void;
  readonly lightboxNode: ReactElement;
};

export function useStoryboardLightbox(): UseStoryboardLightboxResult {
  const [attachment, setAttachment] = useState<StoryboardCardAttachment | null>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [imageSize, setImageSize] = useState<{
    readonly width: number;
    readonly height: number;
  } | null>(null);
  const { ensureStreamUrl } = useAttachmentStreamUrl();

  const closeLightbox = useCallback((): void => {
    setAttachment(null);
    setImageSize(null);
  }, []);

  const openCardImage = useCallback((card: CardDB): void => {
    const next = findStoryboardPreviewAttachment(card);
    if (next == null) {
      return;
    }
    setImageSize(null);
    setAttachment(next);
  }, []);

  const scanBlocked =
    attachment != null &&
    !isPlaceholderCardAttachment(attachment) &&
    !isAttachmentViewable(attachment.scanStatus);
  const isImage = attachment != null && attachment.type.startsWith('image/');

  useEffect(() => {
    setImageSize(null);
    if (attachment == null) {
      setStreamUrl('');
      setStreamLoading(false);
      return;
    }
    if (isPlaceholderCardAttachment(attachment) || !isAttachmentViewable(attachment.scanStatus)) {
      setStreamUrl('');
      setStreamLoading(false);
      return;
    }

    let cancelled = false;
    setStreamLoading(true);
    setStreamUrl('');
    void ensureStreamUrl(attachment.id)
      .then((entry) => {
        if (!cancelled) {
          setStreamUrl(entry.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStreamUrl(api.getAttachmentFileUrl(attachment.id));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStreamLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, ensureStreamUrl]);

  useEffect(() => {
    if (!isImage || streamUrl.trim() === '') {
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) {
        return;
      }
      const maxImageWidth = Math.floor(window.innerWidth * 0.96);
      const maxImageHeight = Math.floor(window.innerHeight * 0.92);
      const widthScale = maxImageWidth / img.naturalWidth;
      const heightScale = maxImageHeight / img.naturalHeight;
      const scale = Math.min(1, widthScale, heightScale);
      setImageSize({
        width: Math.max(1, Math.round(img.naturalWidth * scale)),
        height: Math.max(1, Math.round(img.naturalHeight * scale)),
      });
    };
    img.src = streamUrl;

    return () => {
      cancelled = true;
    };
  }, [isImage, streamUrl]);

  const lightboxNode = (
    <AttachmentPreviewModal
      attachment={attachment}
      linkPreviewUrl={streamUrl}
      linkPreviewStreamLoading={streamLoading}
      linkPreviewScanBlocked={scanBlocked}
      linkPreviewScanMessage={attachment == null ? '' : storyboardScanBlockMessage(attachment)}
      linkPreviewImageSize={imageSize}
      isLinkPreviewImage={isImage}
      isLinkPreviewVideo={false}
      isLinkPreviewPdf={false}
      previewModalProps={buildPreviewModalProps(false, isImage, imageSize)}
      onClose={closeLightbox}
    />
  );

  return { openCardImage, closeLightbox, lightboxNode };
}

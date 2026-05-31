import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Text } from '@mantine/core';
import { useAttachmentStreamUrl } from '../../hooks/useAttachmentStreamUrl.js';
import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import {
  formatCardAttachmentMaxMb,
  getClientCardAttachmentMaxBytes,
} from '../../utils/uploadLimits.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import {
  beginAttachmentUploadNotification,
  completeAttachmentUploadNotification,
  failAttachmentUploadNotification,
  updateAttachmentUploadNotification,
} from '../../utils/attachmentUploadNotifications.js';
import { isCoverAttachment } from '../../utils/attachmentCoverUtils.js';
import { maybeCompressImageForAttachment } from '../../utils/imageCompression.js';
import { buildPreviewModalProps } from '../../components/card/buildPreviewModalProps.js';

export interface UseAttachmentSectionOptions {
  readonly card: CardDB;
  readonly canEdit: boolean;
  readonly onCardUpdate: (card: CardDB) => void;
  readonly onBeforeDeleteAttachment?: (attachmentId: string) => Promise<void>;
}

export function useAttachmentSection({
  card,
  canEdit,
  onCardUpdate,
  onBeforeDeleteAttachment,
}: UseAttachmentSectionOptions) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [linkPreviewAttachmentId, setLinkPreviewAttachmentId] = useState<string | null>(null);
  const [linkPreviewStreamUrl, setLinkPreviewStreamUrl] = useState('');
  const [linkPreviewStreamLoading, setLinkPreviewStreamLoading] = useState(false);
  const { ensureStreamUrl } = useAttachmentStreamUrl();
  const [linkPreviewImageSize, setLinkPreviewImageSize] = useState<{
    readonly width: number;
    readonly height: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentMaxMb = useMemo(
    () => formatCardAttachmentMaxMb(getClientCardAttachmentMaxBytes()),
    [],
  );

  const handleSetCoverFromAttachment = async (attachmentId: string, imageUrl: string) => {
    setCoverBusy(true);
    try {
      const isCurrentCover = isCoverAttachment(card.cover, imageUrl);
      let nextCover = '';
      if (!isCurrentCover) {
        nextCover = api.getAttachmentFileUrl(attachmentId);
      }

      const response = await api.updateCard(card.id, { cover: nextCover });
      const updated = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updated);
      notifications.show({
        color: 'green',
        title: isCurrentCover ? 'Cover removed' : 'Cover updated',
        message: isCurrentCover
          ? 'This image is no longer the card cover.'
          : 'This image is now the card cover.',
      });
    } catch (err) {
      console.error('Error setting cover from attachment:', err);
      notifications.show({
        color: 'red',
        title: 'Could not set cover',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setCoverBusy(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) {
      return;
    }
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = getClientCardAttachmentMaxBytes();
    const maxMb = formatCardAttachmentMaxMb(maxSize);
    const oversizedFiles = Array.from(files).filter((file) => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      setError(`File(s) exceed size limit of ${maxMb} MB: ${oversizedFiles.map((f) => f.name).join(', ')}`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const fileList = Array.from(files);
      await Promise.all(
        fileList.map(async (file, index) => {
          const uploadFile = await maybeCompressImageForAttachment(file);
          const label =
            fileList.length > 1
              ? `${uploadFile.name} (${index + 1}/${fileList.length})`
              : uploadFile.name;
          beginAttachmentUploadNotification(label);
          await api.uploadCardAttachment(card.id, uploadFile, (progress: number) => {
            updateAttachmentUploadNotification(label, progress);
          });
          completeAttachmentUploadNotification(uploadFile.name);
        }),
      );

      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi(response.card, card.id);
      onCardUpdate(updatedCard);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        failAttachmentUploadNotification(err.message);
      } else {
        setError('Failed to upload file');
        failAttachmentUploadNotification('Failed to upload file');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = useCallback(
    (attachmentId: string) => {
      if (!canEdit) {
        return;
      }
      modals.openConfirmModal({
        title: 'Delete attachment',
        children: <Text size="sm">Delete this attachment?</Text>,
        labels: { confirm: 'Delete', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            await onBeforeDeleteAttachment?.(attachmentId);
            await api.deleteCardAttachment(card.id, attachmentId);
            const response = await api.getCard(card.id);
            const updatedCard = normalizeCardFromApi(response.card, card.id);
            onCardUpdate(updatedCard);
          } catch (deleteError) {
            console.error('Error deleting attachment:', deleteError);
            notifications.show({
              color: 'red',
              title: 'Could not delete attachment',
              message: deleteError instanceof Error ? deleteError.message : 'Unknown error',
            });
          }
        },
      });
    },
    [canEdit, card.id, onBeforeDeleteAttachment, onCardUpdate],
  );

  const listImageUrls = useMemo(() => {
    const next: Record<string, string> = {};
    for (const attachment of card.attachments ?? []) {
      if (!isPlaceholderCardAttachment(attachment) && attachment.type.startsWith('image/')) {
        next[attachment.id] = api.getAttachmentFileUrl(attachment.id);
      }
    }
    return next;
  }, [card.attachments]);

  const linkPreviewAttachment =
    linkPreviewAttachmentId == null
      ? null
      : card.attachments.find((att) => att.id === linkPreviewAttachmentId) ?? null;
  const linkPreviewUrl = linkPreviewStreamUrl;
  const isLinkPreviewImage =
    linkPreviewAttachment != null && linkPreviewAttachment.type.startsWith('image/');
  const isLinkPreviewVideo =
    linkPreviewAttachment != null && linkPreviewAttachment.type.startsWith('video/');
  const isLinkPreviewPdf =
    linkPreviewAttachment != null && linkPreviewAttachment.type === 'application/pdf';

  const openAttachmentPreview = useCallback((attachmentId: string): void => {
    setLinkPreviewAttachmentId(attachmentId);
  }, []);

  const closeAttachmentPreview = useCallback((): void => {
    setLinkPreviewAttachmentId(null);
    setLinkPreviewImageSize(null);
  }, []);

  useEffect(() => {
    setLinkPreviewImageSize(null);
    if (linkPreviewAttachmentId == null) {
      setLinkPreviewStreamUrl('');
      setLinkPreviewStreamLoading(false);
      return;
    }
    const att = card.attachments.find((a) => a.id === linkPreviewAttachmentId);
    if (att == null || isPlaceholderCardAttachment(att)) {
      setLinkPreviewAttachmentId(null);
      setLinkPreviewImageSize(null);
      setLinkPreviewStreamUrl('');
      return;
    }

    if (att.type.startsWith('video/')) {
      setLinkPreviewStreamUrl('');
      setLinkPreviewStreamLoading(false);
      return;
    }

    let cancelled = false;
    setLinkPreviewStreamLoading(true);
    setLinkPreviewStreamUrl('');
    void ensureStreamUrl(linkPreviewAttachmentId)
      .then((entry) => {
        if (!cancelled) {
          setLinkPreviewStreamUrl(entry.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLinkPreviewStreamUrl(api.getAttachmentFileUrl(linkPreviewAttachmentId));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLinkPreviewStreamLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [card.attachments, ensureStreamUrl, linkPreviewAttachmentId]);

  useEffect(() => {
    if (!isLinkPreviewImage || linkPreviewUrl.trim() === '') {
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
      setLinkPreviewImageSize({
        width: Math.max(1, Math.round(img.naturalWidth * scale)),
        height: Math.max(1, Math.round(img.naturalHeight * scale)),
      });
    };
    img.src = linkPreviewUrl;

    return () => {
      cancelled = true;
    };
  }, [isLinkPreviewImage, linkPreviewUrl]);

  const previewModalProps = buildPreviewModalProps(
    isLinkPreviewVideo,
    isLinkPreviewImage,
    linkPreviewImageSize,
  );

  return {
    uploading,
    error,
    coverBusy,
    fileInputRef,
    attachmentMaxMb,
    listImageUrls,
    linkPreviewAttachment,
    linkPreviewUrl,
    linkPreviewStreamLoading,
    linkPreviewImageSize,
    isLinkPreviewImage,
    isLinkPreviewVideo,
    isLinkPreviewPdf,
    previewModalProps,
    handleSetCoverFromAttachment,
    handleFileSelect,
    handleDelete,
    openAttachmentPreview,
    closeAttachmentPreview,
  };
}

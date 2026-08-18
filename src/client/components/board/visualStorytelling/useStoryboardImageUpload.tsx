import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import type { CardDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import {
  formatCardAttachmentMaxMb,
  getClientCardAttachmentMaxBytes,
} from '../../../utils/uploadLimits.js';
import { maybeCompressImageForAttachment } from '../../../utils/imageCompression.js';
import {
  beginAttachmentUploadNotification,
  failAttachmentUploadNotification,
  updateAttachmentUploadNotification,
} from '../../../utils/attachmentUploadNotifications.js';
import {
  finalizeAttachmentUploadNotification,
  refreshCardAfterUpload,
} from '../../../utils/attachmentUploadFlow.js';
import { requireUploadedAttachmentId } from '../../../utils/api/attachmentApiMethods.js';
import { prewarmMalwareScannerOnUploadIntent } from '../../../utils/prewarmMalwareScanner.js';
import { isAttachmentViewable } from '../../../../shared/attachmentScanStatus.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { validateStoryboardImageFile } from './storyboardImage.js';

/**
 * ponytail: same stack as card attachment upload (`POST /cards/:id/attachments` + malware scan +
 * size cap), then `updateCard({ cover })` so the image is the hero/content face.
 * Layout: render `{upload.fileInputNode}` once. Add Hero / Add content: create list+card (or card),
 * then `const file = await upload.pickImageFile(); if (file) await upload.uploadImageToCard(card.id, file)`.
 */
export type UseStoryboardImageUploadOptions = {
  readonly canEdit: boolean;
  readonly onCardUpdate: (card: CardDB) => void;
};

export type UseStoryboardImageUploadResult = {
  readonly uploading: boolean;
  readonly error: string | null;
  readonly attachmentMaxMb: number;
  readonly fileInputNode: ReactElement;
  readonly pickImageFile: () => Promise<File | null>;
  readonly uploadImageToCard: (cardId: string, file: File) => Promise<CardDB>;
  readonly uploadImagesToCard: (card: CardDB, files: readonly File[]) => Promise<void>;
};

export function useStoryboardImageUpload({
  canEdit,
  onCardUpdate,
}: UseStoryboardImageUploadOptions): UseStoryboardImageUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickResolverRef = useRef<((file: File | null) => void) | null>(null);
  const attachmentMaxMb = useMemo(
    () => formatCardAttachmentMaxMb(getClientCardAttachmentMaxBytes()),
    [],
  );

  const finishPick = useCallback((file: File | null): void => {
    const resolve = pickResolverRef.current;
    pickResolverRef.current = null;
    resolve?.(file);
  }, []);

  const pickImageFile = useCallback((): Promise<File | null> => {
    if (!canEdit || uploading) {
      return Promise.resolve(null);
    }
    pickResolverRef.current?.(null);
    prewarmMalwareScannerOnUploadIntent();
    return new Promise((resolve) => {
      pickResolverRef.current = resolve;
      fileInputRef.current?.click();
    });
  }, [canEdit, uploading]);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      finishPick(file);
    },
    [finishPick],
  );

  const handleFileInputCancel = useCallback((): void => {
    finishPick(null);
  }, [finishPick]);

  useEffect(() => {
    const el = fileInputRef.current;
    if (el == null) {
      return undefined;
    }
    const onCancel = (): void => {
      handleFileInputCancel();
    };
    el.addEventListener('cancel', onCancel);
    return () => {
      el.removeEventListener('cancel', onCancel);
    };
  }, [handleFileInputCancel]);

  const uploadImageToCard = useCallback(
    async (cardId: string, file: File): Promise<CardDB> => {
      if (!canEdit) {
        throw new Error('You cannot upload images on this board.');
      }
      const maxBytes = getClientCardAttachmentMaxBytes();
      const validationError = validateStoryboardImageFile(file, maxBytes);
      if (validationError != null) {
        setError(validationError);
        throw new Error(validationError);
      }

      setError(null);
      setUploading(true);
      try {
        const uploadFile = await maybeCompressImageForAttachment(file);
        beginAttachmentUploadNotification(uploadFile.name);
        const uploadResponse = await api.uploadCardAttachment(cardId, uploadFile, (progress) => {
          updateAttachmentUploadNotification(uploadFile.name, progress);
        });
        await finalizeAttachmentUploadNotification({
          cardId,
          label: uploadFile.name,
          uploadResponse,
        });

        const attachmentId = requireUploadedAttachmentId(uploadResponse);
        const refreshed = await refreshCardAfterUpload(cardId, cardId);
        const uploaded = refreshed.attachments.find((att) => att.id === attachmentId);
        if (uploaded == null || !isAttachmentViewable(uploaded.scanStatus)) {
          onCardUpdate(refreshed);
          return refreshed;
        }

        const cover = api.getAttachmentFileUrl(attachmentId);
        const response = await api.updateCard(cardId, { cover });
        const updated = normalizeCardFromApi(response.card, cardId);
        onCardUpdate(updated);
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload file';
        setError(message);
        failAttachmentUploadNotification(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setUploading(false);
      }
    },
    [canEdit, onCardUpdate],
  );

  const uploadImagesToCard = useCallback(
    async (card: CardDB, files: readonly File[]): Promise<void> => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length === 0) {
        const message = 'Choose an image file.';
        setError(message);
        throw new Error(message);
      }
      for (const file of images) {
        await uploadImageToCard(card.id, file);
      }
    },
    [uploadImageToCard],
  );

  const fileInputNode = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      hidden
      disabled={uploading || !canEdit}
      onChange={handleFileInputChange}
    />
  );

  return {
    uploading,
    error,
    attachmentMaxMb,
    fileInputNode,
    pickImageFile,
    uploadImageToCard,
    uploadImagesToCard,
  };
}

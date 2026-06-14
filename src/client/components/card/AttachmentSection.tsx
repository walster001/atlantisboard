import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconPaperclip, IconUpload } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { useAttachmentSection } from '../../hooks/card/useAttachmentSection.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import { AttachmentListRow } from './AttachmentListRow.js';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.js';
import './cardDescriptionTiptap.css';
import './attachmentSection.css';

interface AttachmentSectionProps {
  card: CardDB;
  canEdit?: boolean;
  onCardUpdate: (card: CardDB) => void;
  onBeforeDeleteAttachment?: (attachmentId: string) => Promise<void>;
}

export function AttachmentSection({
  card,
  canEdit = true,
  onCardUpdate,
  onBeforeDeleteAttachment,
}: AttachmentSectionProps) {
  const {
    uploading,
    error,
    coverBusy,
    fileInputRef,
    attachmentMaxMb,
    panelAttachments,
    listImageUrls,
    linkPreviewAttachment,
    linkPreviewUrl,
    linkPreviewStreamLoading,
    linkPreviewScanBlocked,
    linkPreviewScanMessage,
    linkPreviewImageSize,
    isLinkPreviewImage,
    isLinkPreviewVideo,
    isLinkPreviewPdf,
    previewModalProps,
    handleSetCoverFromAttachment,
    handleFileSelect,
    handleDelete,
    openFilePicker,
    openAttachmentPreview,
    closeAttachmentPreview,
  } = useAttachmentSection({
    card,
    canEdit,
    onCardUpdate,
    ...(card.description !== undefined ? { descriptionJson: card.description } : {}),
    ...(onBeforeDeleteAttachment !== undefined ? { onBeforeDeleteAttachment } : {}),
  });

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconPaperclip size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          <Text {...cardDetailSectionTitleProps}>Attachments</Text>
        </Group>
        {canEdit ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <Button
              size="sm"
              variant="default"
              leftSection={<IconUpload size={16} />}
              styles={cardDetailSoftButtonStyles}
              onClick={openFilePicker}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Add'}
            </Button>
          </>
        ) : null}
      </Group>

      {error ? <Alert color="red">{error}</Alert> : null}

      {panelAttachments.length > 0 ? (
        <Stack gap="xs">
          {panelAttachments.map((attachment) => (
            <AttachmentListRow
              key={attachment.id}
              attachment={attachment}
              {...(card.cover !== undefined ? { cardCover: card.cover } : {})}
              {...(listImageUrls[attachment.id] !== undefined
                ? { listImageUrl: listImageUrls[attachment.id] }
                : {})}
              canEdit={canEdit}
              coverBusy={coverBusy}
              uploading={uploading}
              onPreview={openAttachmentPreview}
              onSetCover={handleSetCoverFromAttachment}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      ) : (
        <Text {...cardDetailEmptyStateProps}>
          No attachments yet. Click Add to upload files.
        </Text>
      )}

      <Text size="xs" c="dimmed">
        File size limit: {attachmentMaxMb} MB<br />
        Supported: All file types (malware scanning enabled). Use <strong>Set as card cover</strong> on image
        attachments to show them on the board.
      </Text>

      <AttachmentPreviewModal
        attachment={linkPreviewAttachment}
        linkPreviewUrl={linkPreviewUrl}
        linkPreviewStreamLoading={linkPreviewStreamLoading}
        linkPreviewScanBlocked={linkPreviewScanBlocked}
        linkPreviewScanMessage={linkPreviewScanMessage}
        linkPreviewImageSize={linkPreviewImageSize}
        isLinkPreviewImage={isLinkPreviewImage}
        isLinkPreviewVideo={isLinkPreviewVideo}
        isLinkPreviewPdf={isLinkPreviewPdf}
        previewModalProps={previewModalProps}
        onClose={closeAttachmentPreview}
      />
    </Stack>
  );
}

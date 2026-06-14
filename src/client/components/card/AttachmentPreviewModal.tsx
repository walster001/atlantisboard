import { createPortal } from 'react-dom';
import { Box, Button, Modal, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { CardDB } from '../../store/database.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { api } from '../../utils/api.js';
import { CardDescriptionVideoPlayer } from './CardDescriptionVideoPlayer.js';

interface AttachmentPreviewModalProps {
  readonly attachment: NonNullable<CardDB['attachments']>[number] | null;
  readonly linkPreviewUrl: string;
  readonly linkPreviewStreamLoading: boolean;
  readonly linkPreviewScanBlocked: boolean;
  readonly linkPreviewScanMessage: string;
  readonly linkPreviewImageSize: { readonly width: number; readonly height: number } | null;
  readonly isLinkPreviewImage: boolean;
  readonly isLinkPreviewVideo: boolean;
  readonly isLinkPreviewPdf: boolean;
  readonly previewModalProps: Record<string, unknown>;
  readonly onClose: () => void;
}

function AttachmentVideoMobileFullscreen({
  attachment,
  onClose,
}: {
  readonly attachment: NonNullable<CardDB['attachments']>[number];
  readonly onClose: () => void;
}) {
  return createPortal(
    <Box className="attachment-video-mobile-fullscreen" role="dialog" aria-modal="true">
      <UnstyledButton
        type="button"
        className="attachment-preview-close"
        aria-label="Close preview"
        onClick={onClose}
      >
        <IconX size={16} aria-hidden />
      </UnstyledButton>
      <CardDescriptionVideoPlayer
        key={attachment.id}
        src={api.getAttachmentFileUrl(attachment.id)}
        className="card-desc-video-player card-desc-video-player--modal-fullscreen"
        title={attachment.name}
        isolateDescriptionClicks={false}
      />
    </Box>,
    document.body,
  );
}

export function AttachmentPreviewModal({
  attachment,
  linkPreviewUrl,
  linkPreviewStreamLoading,
  linkPreviewScanBlocked,
  linkPreviewScanMessage,
  linkPreviewImageSize,
  isLinkPreviewImage,
  isLinkPreviewVideo,
  isLinkPreviewPdf,
  previewModalProps,
  onClose,
}: AttachmentPreviewModalProps) {
  const isMobile = useResponsiveTier() === 'mobile';

  if (attachment != null && isMobile && isLinkPreviewVideo && !linkPreviewScanBlocked) {
    return <AttachmentVideoMobileFullscreen attachment={attachment} onClose={onClose} />;
  }

  return (
    <Modal opened={attachment != null} onClose={onClose} {...previewModalProps}>
      {attachment == null ? null : (
        <Box
          style={
            isLinkPreviewVideo
              ? {
                  position: 'relative',
                  flex: 1,
                  width: '100%',
                  minHeight: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }
              : { position: 'relative', lineHeight: 0 }
          }
        >
          <UnstyledButton
            type="button"
            className="attachment-preview-close"
            aria-label="Close preview"
            onClick={onClose}
          >
            <IconX size={16} aria-hidden />
          </UnstyledButton>
          {linkPreviewScanBlocked ? (
            <Text size="sm" c="dimmed">
              {linkPreviewScanMessage}
            </Text>
          ) : linkPreviewStreamLoading ? (
            <Text size="sm" c="dimmed">
              Loading preview…
            </Text>
          ) : isLinkPreviewImage && linkPreviewUrl.trim() !== '' ? (
            <Box
              component="img"
              src={linkPreviewUrl}
              alt={attachment.name}
              style={{
                width: linkPreviewImageSize == null ? 'auto' : `${linkPreviewImageSize.width}px`,
                height: linkPreviewImageSize == null ? 'auto' : `${linkPreviewImageSize.height}px`,
                maxWidth: '96vw',
                maxHeight: '92vh',
                objectFit: 'contain',
                marginInline: 'auto',
                display: 'block',
              }}
            />
          ) : isLinkPreviewVideo ? (
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                boxSizing: 'border-box',
              }}
            >
              <CardDescriptionVideoPlayer
                key={attachment.id}
                src={api.getAttachmentFileUrl(attachment.id)}
                className="card-desc-video-player card-desc-video-player--modal-fullscreen"
                title={attachment.name}
                isolateDescriptionClicks={false}
              />
            </Box>
          ) : isLinkPreviewPdf && linkPreviewUrl.trim() !== '' ? (
            <Box style={{ width: '100%', height: '86vh' }}>
              <iframe
                src={linkPreviewUrl}
                title={attachment.name}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </Box>
          ) : (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Preview is not available for this file type.
              </Text>
              <Button
                component="a"
                href={linkPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="default"
              >
                Open attachment
              </Button>
            </Stack>
          )}
        </Box>
      )}
    </Modal>
  );
}

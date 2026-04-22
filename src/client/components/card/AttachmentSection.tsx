import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Stack,
  Text,
  Button,
  Alert,
  Group,
  Progress,
  Anchor,
  ActionIcon,
  Box,
  Image,
  Modal,
  UnstyledButton,
  Badge,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPaperclip, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { normalizeCardFromApi } from '../../utils/transform.js';
import {
  CARD_DETAIL_SECTION_ICON_COLOR,
  cardDetailEmptyStateProps,
  cardDetailSectionTitleProps,
  cardDetailSoftButtonStyles,
} from './cardDetailSectionUi.js';
import './cardDescriptionTiptap.css';
import './attachmentSection.css';

interface AttachmentSectionProps {
  card: CardDB;
  onCardUpdate: (card: CardDB) => void;
  /**
   * Runs before `deleteCardAttachment` (e.g. strip description + clear cover when the file is both
   * cover and inline media). Optional — default delete path unchanged when omitted.
   */
  onBeforeDeleteAttachment?: (attachmentId: string) => Promise<void>;
}

export function AttachmentSection({
  card,
  onCardUpdate,
  onBeforeDeleteAttachment,
}: AttachmentSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [linkPreviewAttachmentId, setLinkPreviewAttachmentId] = useState<string | null>(null);
  const [linkPreviewImageSize, setLinkPreviewImageSize] = useState<{
    readonly width: number;
    readonly height: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractObjectPath = (rawUrl: string): string => {
    const trimmed = rawUrl.trim();
    if (trimmed === '') {
      return '';
    }
    try {
      const parsed = new URL(trimmed);
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      return pathname.includes('/') ? pathname.split('/').slice(-2).join('/') : pathname;
    } catch {
      const withoutQuery = decodeURIComponent(trimmed.split('?')[0] ?? trimmed).replace(/^\/+/, '');
      return withoutQuery.includes('/') ? withoutQuery.split('/').slice(-2).join('/') : withoutQuery;
    }
  };

  const isCurrentCoverAttachment = (imageUrl: string): boolean => {
    if (typeof card.cover !== 'string' || card.cover.trim() === '') {
      return false;
    }
    return extractObjectPath(card.cover) === extractObjectPath(imageUrl);
  };

  const handleSetCoverFromAttachment = async (attachmentId: string, imageUrl: string) => {
    setCoverBusy(true);
    try {
      const isCurrentCover = isCurrentCoverAttachment(imageUrl);
      let nextCover = '';
      if (!isCurrentCover) {
        // Persist cover as app-origin API stream URL to stay reverse-proxy/CSP friendly.
        nextCover = api.getAttachmentFileUrl(attachmentId);
      }

      const response = await api.updateCard(card.id, { cover: nextCover });
      const updated = normalizeCardFromApi((response as { card: unknown }).card, card.id);
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

  const maybeCompressImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return file;
    }
    const maxDimension = 1920;
    const quality = 0.82;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();

      const outputType =
        file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, outputType, quality);
      });
      if (!blob || blob.size >= file.size) {
        return file;
      }
      return new File([blob], file.name, { type: outputType, lastModified: Date.now() });
    } catch {
      return file;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // File size limit: 1000 MB
    const maxSize = 1000 * 1024 * 1024;
    const oversizedFiles = Array.from(files).filter((file) => file.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      setError(`File(s) exceed size limit of 1000 MB: ${oversizedFiles.map((f) => f.name).join(', ')}`);
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      // Upload all selected files
      for (const file of Array.from(files)) {
        const uploadFile = await maybeCompressImage(file);
        await api.uploadCardAttachment(card.id, uploadFile, (progress: number) => {
          setUploadProgress(progress);
        });
      }

      // Reload card to get updated attachments
      const response = await api.getCard(card.id);
      const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
      onCardUpdate(updatedCard);

      setUploadProgress(0);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to upload file');
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = (attachmentId: string) => {
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
          const updatedCard = normalizeCardFromApi((response as { card: unknown }).card, card.id);
          onCardUpdate(updatedCard);
        } catch (error) {
          console.error('Error deleting attachment:', error);
          notifications.show({
            color: 'red',
            title: 'Could not delete attachment',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileIcon = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.includes('zip') || type.includes('archive')) return '📦';
    return '📎';
  };

  const resolvedUrls = useMemo(() => {
    const next: Record<string, string> = {};
    for (const attachment of card.attachments ?? []) {
      if (!isPlaceholderCardAttachment(attachment)) {
        next[attachment.id] = api.getAttachmentFileUrl(attachment.id);
      }
    }
    return next;
  }, [card.attachments]);

  const linkPreviewAttachment =
    linkPreviewAttachmentId == null
      ? null
      : card.attachments.find((att) => att.id === linkPreviewAttachmentId) ?? null;
  const linkPreviewUrl =
    linkPreviewAttachment == null || isPlaceholderCardAttachment(linkPreviewAttachment)
      ? ''
      : (resolvedUrls[linkPreviewAttachment.id] ?? api.resolveAttachmentUrl(linkPreviewAttachment.url));
  const isLinkPreviewImage =
    linkPreviewAttachment != null && linkPreviewAttachment.type.startsWith('image/');
  const isLinkPreviewVideo =
    linkPreviewAttachment != null && linkPreviewAttachment.type.startsWith('video/');
  const isLinkPreviewPdf =
    linkPreviewAttachment != null && linkPreviewAttachment.type === 'application/pdf';

  useEffect(() => {
    setLinkPreviewImageSize(null);
    if (linkPreviewAttachmentId == null) {
      return;
    }
    const att = card.attachments.find((a) => a.id === linkPreviewAttachmentId);
    if (att == null || isPlaceholderCardAttachment(att)) {
      setLinkPreviewAttachmentId(null);
      setLinkPreviewImageSize(null);
    }
  }, [card.attachments, linkPreviewAttachmentId]);

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

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconPaperclip size={18} stroke={1.5} color={CARD_DETAIL_SECTION_ICON_COLOR} aria-hidden />
          <Text {...cardDetailSectionTitleProps}>Attachments</Text>
        </Group>
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
          onClick={() => (fileInputRef.current as HTMLInputElement)?.click()}
          disabled={uploading}
        >
          {uploading ? `Uploading... ${uploadProgress}%` : 'Add'}
        </Button>
      </Group>

      {error && (
        <Alert color="red">
          {error}
        </Alert>
      )}

      {uploading && (
        <Progress value={uploadProgress} size="sm" radius="xl" />
      )}

      {card.attachments && card.attachments.length > 0 ? (
        <Stack gap="xs">
          {card.attachments.map((attachment) => {
            const isPh = isPlaceholderCardAttachment(attachment);
            const displayNameStyle = {
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            } as const;
            const mappingName =
              typeof attachment.originalFileName === 'string' && attachment.originalFileName.trim() !== ''
                ? attachment.originalFileName.trim()
                : attachment.name;
            return (
            <Group
              key={attachment.id}
              justify="space-between"
              align="center"
              p="md"
              style={{
                backgroundColor: 'var(--mantine-color-gray-1)',
                borderRadius: 'var(--mantine-radius-md)',
              }}
            >
              <Group gap="md" style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }} wrap="nowrap">
                {attachment.type.startsWith('image/') ? (
                  <Box
                    style={{
                      width: 160,
                      minWidth: 160,
                      height: 96,
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: 'var(--mantine-color-gray-2)',
                      border: '1px solid var(--mantine-color-gray-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isPh ? (
                      <Text size="xs" c="dimmed" ta="center" px="xs">
                        No preview — file not in storage
                      </Text>
                    ) : (
                    <Image
                      src={resolvedUrls[attachment.id] ?? api.resolveAttachmentUrl(attachment.url)}
                      alt={attachment.name}
                      width={160}
                      height={96}
                      fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='96'%3E%3Crect width='160' height='96' fill='%23e9ecef'/%3E%3C/svg%3E"
                      style={{ objectFit: 'cover' }}
                    />
                    )}
                  </Box>
                ) : attachment.type.startsWith('video/') ? (
                  <Box
                    style={{
                      width: 160,
                      minWidth: 160,
                      height: 96,
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: 'var(--mantine-color-dark-9)',
                      border: '1px solid var(--mantine-color-gray-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isPh ? (
                      <Text size="xs" c="dimmed" ta="center" px="xs">
                        No preview — file not in storage
                      </Text>
                    ) : (
                    <video
                      src={resolvedUrls[attachment.id] ?? api.resolveAttachmentUrl(attachment.url)}
                      muted
                      playsInline
                      preload="metadata"
                      controls={false}
                      disablePictureInPicture
                      tabIndex={-1}
                      aria-hidden
                      onContextMenu={(e) => {
                        e.preventDefault();
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                    )}
                  </Box>
                ) : (
                  <Box
                    style={{
                      width: 40,
                      minWidth: 40,
                      height: 40,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'var(--mantine-color-gray-2)',
                    }}
                  >
                    <Text size="xl">{getFileIcon(attachment.type)}</Text>
                  </Box>
                )}
                <Box style={{ flex: 1, minWidth: 0, alignSelf: 'center' }}>
                  {isPh ? (
                    <Text fw={500} style={displayNameStyle}>
                      {attachment.name}
                    </Text>
                  ) : (
                  <Anchor
                    href={resolvedUrls[attachment.id] ?? api.resolveAttachmentUrl(attachment.url)}
                    fw={500}
                    onClick={(event) => {
                      event.preventDefault();
                      setLinkPreviewAttachmentId(attachment.id);
                    }}
                    style={displayNameStyle}
                  >
                    {attachment.name}
                  </Anchor>
                  )}
                  {isPh ? (
                    <Badge size="xs" variant="light" color="gray" mt={6}>
                      Import placeholder
                    </Badge>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    {formatFileSize(attachment.size)} • {new Date(attachment.uploadedAt).toLocaleDateString()}
                  </Text>
                  {isPh ? (
                    <Text size="xs" c="dimmed" mt={4}>
                      Original filename (for mapping): {mappingName}
                    </Text>
                  ) : null}
                  {attachment.type.startsWith('image/') && !isPh ? (
                    <Button
                      size="xs"
                      variant="light"
                      mt={6}
                      disabled={coverBusy || uploading}
                      onClick={() => void handleSetCoverFromAttachment(attachment.id, attachment.url)}
                    >
                      {isCurrentCoverAttachment(attachment.url) ? 'Remove from cover' : 'Set as card cover'}
                    </Button>
                  ) : null}
                </Box>
              </Group>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => handleDelete(attachment.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            );
          })}
        </Stack>
      ) : (
        <Text {...cardDetailEmptyStateProps}>
          No attachments yet. Click Add to upload files.
        </Text>
      )}

      <Text size="xs" c="dimmed">
        File size limit: 1000 MB<br />
        Supported: All file types (malware scanning enabled). Use <strong>Set as card cover</strong> on image
        attachments to show them on the board.
      </Text>

      <Modal
        opened={linkPreviewAttachment != null}
        onClose={() => {
          setLinkPreviewAttachmentId(null);
          setLinkPreviewImageSize(null);
        }}
        fullScreen={isLinkPreviewVideo}
        withCloseButton={false}
        {...(isLinkPreviewVideo ? { padding: 0, yOffset: 0, xOffset: 0 } : {})}
        {...(isLinkPreviewVideo
          ? {}
          : isLinkPreviewImage
            ? {
                size: `${(linkPreviewImageSize?.width ?? Math.floor(window.innerWidth * 0.96))}px`,
              }
            : { size: '90vw' as const })}
        centered={!isLinkPreviewVideo}
        styles={
          isLinkPreviewVideo
            ? {
                inner: {
                  padding: 0,
                  alignItems: 'stretch',
                  justifyContent: 'stretch',
                  minHeight: '100dvh',
                  height: '100dvh',
                  maxHeight: '100dvh',
                },
                content: {
                  padding: 0,
                  maxHeight: '100dvh',
                  height: '100dvh',
                  minHeight: '100dvh',
                  maxWidth: '100vw',
                  width: '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: '1 1 100%',
                  backgroundColor: 'var(--mantine-color-dark-9)',
                },
                body: {
                  flex: 1,
                  minHeight: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  justifyContent: 'stretch',
                  padding: 0,
                  position: 'relative',
                  backgroundColor: 'var(--mantine-color-dark-9)',
                  overflow: 'hidden',
                },
              }
            : {
                content: {
                  maxWidth: '96vw',
                  width:
                    isLinkPreviewImage && linkPreviewImageSize != null
                      ? `${linkPreviewImageSize.width}px`
                      : isLinkPreviewImage
                        ? '96vw'
                        : '90vw',
                  minWidth: isLinkPreviewImage ? 'unset' : undefined,
                  maxHeight: '92vh',
                  overflow: 'hidden',
                },
                body: {
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  position: 'relative',
                },
              }
        }
      >
        {linkPreviewAttachment == null ? null : (
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
              onClick={() => {
                setLinkPreviewAttachmentId(null);
                setLinkPreviewImageSize(null);
              }}
            >
              <IconX size={16} aria-hidden />
            </UnstyledButton>
            {isLinkPreviewImage ? (
              <Box
                component="img"
                src={linkPreviewUrl}
                alt={linkPreviewAttachment.name}
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
                <video
                  key={linkPreviewAttachment.id}
                  className="card-desc-video-player card-desc-video-player--modal-fullscreen"
                  controls
                  playsInline
                  preload="metadata"
                  src={linkPreviewUrl}
                  title={linkPreviewAttachment.name}
                />
              </Box>
            ) : isLinkPreviewPdf ? (
              <Box style={{ width: '100%', height: '86vh' }}>
                <iframe
                  src={linkPreviewUrl}
                  title={linkPreviewAttachment.name}
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
    </Stack>
  );
}


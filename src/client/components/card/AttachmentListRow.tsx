import { memo } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import { isPlaceholderCardAttachment } from '../../../shared/cardAttachmentPlaceholder.js';
import {
  attachmentScanBlockedMessage,
  isAttachmentViewable,
} from '../../../shared/attachmentScanStatus.js';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';
import { isCoverAttachment } from '../../utils/attachmentCoverUtils.js';
import { formatFileSize, getFileIcon } from '../../utils/fileUtils.js';

interface AttachmentListRowProps {
  readonly attachment: NonNullable<CardDB['attachments']>[number];
  readonly cardCover?: string;
  readonly listImageUrl?: string;
  readonly canEdit: boolean;
  readonly coverBusy: boolean;
  readonly uploading: boolean;
  readonly onPreview: (attachmentId: string) => void;
  readonly onSetCover: (attachmentId: string, imageUrl: string) => void;
  readonly onDelete: (attachmentId: string) => void;
}

export const AttachmentListRow = memo(function AttachmentListRow({
  attachment,
  cardCover,
  listImageUrl,
  canEdit,
  coverBusy,
  uploading,
  onPreview,
  onSetCover,
  onDelete,
}: AttachmentListRowProps) {
  const isPh = isPlaceholderCardAttachment(attachment);
  const scanBlocked = !isPh && !isAttachmentViewable(attachment.scanStatus);
  const scanMessage = scanBlocked ? attachmentScanBlockedMessage(attachment.scanStatus) : '';
  const canPreview = !isPh && !scanBlocked;
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
          <UnstyledButton
            type="button"
            aria-label={`Preview ${attachment.name}`}
            disabled={!canPreview}
            onClick={() => {
              if (canPreview) {
                onPreview(attachment.id);
              }
            }}
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
              padding: 0,
              cursor: canPreview ? 'pointer' : 'default',
            }}
          >
            {isPh ? (
              <Text size="xs" c="dimmed" ta="center" px="xs">
                No preview — file not in storage
              </Text>
            ) : scanBlocked ? (
              <Text size="xs" c="dimmed" ta="center" px="xs">
                Scan in progress
              </Text>
            ) : (
              <Image
                src={listImageUrl ?? api.resolveAttachmentUrl(attachment.url)}
                alt={attachment.name}
                width={160}
                height={96}
                fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='96'%3E%3Crect width='160' height='96' fill='%23e9ecef'/%3E%3C/svg%3E"
                style={{ objectFit: 'cover' }}
              />
            )}
          </UnstyledButton>
        ) : attachment.type.startsWith('video/') ? (
          <UnstyledButton
            type="button"
            aria-label={`Preview ${attachment.name}`}
            disabled={!canPreview}
            onClick={() => {
              if (canPreview) {
                onPreview(attachment.id);
              }
            }}
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
              padding: 0,
              cursor: canPreview ? 'pointer' : 'default',
            }}
          >
            {isPh ? (
              <Text size="xs" c="dimmed" ta="center" px="xs">
                No preview — file not in storage
              </Text>
            ) : scanBlocked ? (
              <Text size="xs" c="dimmed" ta="center" px="xs">
                Scan in progress
              </Text>
            ) : (
              <IconPlayerPlay
                size={36}
                stroke={1.5}
                color="var(--mantine-color-gray-4)"
                aria-hidden
              />
            )}
          </UnstyledButton>
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
          ) : scanBlocked ? (
            <Text fw={500} style={displayNameStyle}>
              {attachment.name}
            </Text>
          ) : (
            <Anchor
              href="#"
              fw={500}
              onClick={(event) => {
                event.preventDefault();
                onPreview(attachment.id);
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
          ) : scanBlocked ? (
            <Badge size="xs" variant="light" color={attachment.scanStatus === 'infected' ? 'red' : 'yellow'} mt={6}>
              {attachment.scanStatus === 'infected'
                ? 'Blocked'
                : attachment.scanStatus === 'failed'
                  ? 'Scan failed'
                  : 'Scan pending'}
            </Badge>
          ) : null}
          {scanBlocked && scanMessage !== '' ? (
            <Text size="xs" c="dimmed" mt={4}>
              {scanMessage}
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            {formatFileSize(attachment.size)} • {new Date(attachment.uploadedAt).toLocaleDateString()}
          </Text>
          {isPh ? (
            <Text size="xs" c="dimmed" mt={4}>
              Original filename (for mapping): {mappingName}
            </Text>
          ) : null}
          {canEdit && attachment.type.startsWith('image/') && canPreview ? (
            <Button
              size="xs"
              variant="light"
              mt={6}
              disabled={coverBusy || uploading}
              onClick={() => void onSetCover(attachment.id, attachment.url)}
            >
              {isCoverAttachment(cardCover, attachment.url) ? 'Remove from cover' : 'Set as card cover'}
            </Button>
          ) : null}
        </Box>
      </Group>
      {canEdit ? (
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={() => onDelete(attachment.id)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      ) : null}
    </Group>
  );
});

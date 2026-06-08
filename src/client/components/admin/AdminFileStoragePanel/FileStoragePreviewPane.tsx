import { useEffect, useState } from 'react';
import { Box, Button, Group, Image, Loader, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { api } from '../../../utils/api.js';
import { FileStorageObjectName } from './FileStorageObjectName.js';
import { entryPrimaryLabel, formatFileSize, formatModifiedAt, isLikelyImageEntry } from './helpers.js';

type FileStoragePreviewPaneProps = {
  readonly bucket: MinioBucketName | null;
  readonly entry: AdminFileStorageObjectEntry | null;
  readonly downloadingKey: string | null;
  readonly onDownload: (key: string) => void;
};

export function FileStoragePreviewPane({
  bucket,
  entry,
  downloadingKey,
  onDownload,
}: FileStoragePreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage =
    entry != null &&
    !entry.isFolder &&
    isLikelyImageEntry(entry.contentType, entryPrimaryLabel(entry));

  useEffect(() => {
    if (entry == null || bucket == null || entry.isFolder || !isImage) {
      setPreviewUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);

    void (async () => {
      try {
        const blob = await api.fetchAdminFileStorageObjectBlob(bucket, entry.key);
        if (cancelled) {
          return;
        }
        const objectUrl = window.URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Preview unavailable');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setPreviewUrl((current) => {
        if (current != null) {
          window.URL.revokeObjectURL(current);
        }
        return null;
      });
    };
  }, [bucket, entry, isImage]);

  if (entry == null) {
    return (
      <Box className="admin-file-storage-panel__preview-pane admin-file-storage-panel__preview-pane--empty">
        <Text size="sm" c="dimmed" ta="center">
          Select a file to preview
        </Text>
      </Box>
    );
  }

  if (entry.isFolder) {
    return (
      <Box className="admin-file-storage-panel__preview-pane admin-file-storage-panel__preview-pane--empty">
        <Text size="sm" c="dimmed" ta="center">
          Folders open in the file list
        </Text>
      </Box>
    );
  }

  return (
    <Box className="admin-file-storage-panel__preview-pane">
      <Stack gap="sm" h="100%">
        <Stack gap={2}>
          <FileStorageObjectName entry={entry} />
          <Text size="xs" c="dimmed" ff="monospace" lineClamp={2}>
            {entry.key}
          </Text>
          <Text size="xs" c="dimmed">
            {formatFileSize(entry.size)} · {formatModifiedAt(entry.lastModified)}
          </Text>
          {entry.contentType != null && entry.contentType.trim() !== '' ? (
            <Text size="xs" c="dimmed">
              {entry.contentType}
            </Text>
          ) : null}
        </Stack>

        <Box className="admin-file-storage-panel__preview-media">
          {isImage ? (
            loading ? (
              <Group justify="center" py="lg">
                <Loader size="sm" />
              </Group>
            ) : error != null ? (
              <Text size="sm" c="red">
                {error}
              </Text>
            ) : previewUrl != null ? (
              <Image src={previewUrl} alt={entry.name} fit="contain" mah="100%" maw="100%" />
            ) : null
          ) : (
            <Text size="sm" c="dimmed">
              No preview for this file type.
            </Text>
          )}
        </Box>

        <Button
          variant="light"
          size="xs"
          leftSection={<IconDownload size={16} />}
          loading={downloadingKey === entry.key}
          onClick={() => onDownload(entry.key)}
        >
          Download
        </Button>
      </Stack>
    </Box>
  );
}

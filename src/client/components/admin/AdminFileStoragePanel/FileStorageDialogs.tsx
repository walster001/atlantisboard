import { useEffect, useState } from 'react';
import { Button, Group, Image, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { api } from '../../../utils/api.js';

type FileStorageDialogsProps = {
  readonly selectedBucket: MinioBucketName | null;
  readonly createFolderOpen: boolean;
  readonly creatingFolder: boolean;
  readonly deleteTarget: AdminFileStorageObjectEntry | null;
  readonly deletingKey: string | null;
  readonly previewTarget: AdminFileStorageObjectEntry | null;
  readonly onCloseCreateFolder: () => void;
  readonly onCloseDelete: () => void;
  readonly onClosePreview: () => void;
  readonly onCreateFolder: (folderName: string) => Promise<void>;
  readonly onConfirmDelete: (key: string) => void;
};

export function FileStorageDialogs({
  selectedBucket,
  createFolderOpen,
  creatingFolder,
  deleteTarget,
  deletingKey,
  previewTarget,
  onCloseCreateFolder,
  onCloseDelete,
  onClosePreview,
  onCreateFolder,
  onConfirmDelete,
}: FileStorageDialogsProps) {
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (!createFolderOpen) {
      setFolderName('');
    }
  }, [createFolderOpen]);

  return (
    <>
      <Modal opened={createFolderOpen} onClose={onCloseCreateFolder} title="New folder" centered>
        <Stack gap="md">
          <TextInput
            label="Folder name"
            description="Letters, digits, dots, dashes, and underscores only."
            value={folderName}
            onChange={(event) => setFolderName(event.currentTarget.value)}
            autoFocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCloseCreateFolder}>
              Cancel
            </Button>
            <Button
              loading={creatingFolder}
              disabled={folderName.trim() === ''}
              onClick={() => {
                void onCreateFolder(folderName.trim()).then(() => {
                  onCloseCreateFolder();
                });
              }}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteTarget != null} onClose={onCloseDelete} title="Delete object" centered>
        {deleteTarget != null ? (
          <Stack gap="md">
            <Text size="sm">
              Delete <strong>{deleteTarget.name}</strong>
              {deleteTarget.isFolder ? ' and everything inside it' : ''}? This cannot be undone.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onCloseDelete}>
                Cancel
              </Button>
              <Button
                color="red"
                loading={deletingKey === deleteTarget.key}
                onClick={() => {
                  onConfirmDelete(deleteTarget.key);
                  onCloseDelete();
                }}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <FileStoragePreviewModal
        bucket={selectedBucket}
        entry={previewTarget}
        onClose={onClosePreview}
      />
    </>
  );
}

function FileStoragePreviewModal({
  bucket,
  entry,
  onClose,
}: {
  readonly bucket: MinioBucketName | null;
  readonly entry: AdminFileStorageObjectEntry | null;
  readonly onClose: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry == null || bucket == null) {
      setPreviewUrl(null);
      setError(null);
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
  }, [bucket, entry]);

  return (
    <Modal
      opened={entry != null}
      onClose={onClose}
      title={entry?.name ?? 'Preview'}
      centered
      size="lg"
    >
      {loading ? (
        <Text size="sm" c="dimmed">
          Loading preview…
        </Text>
      ) : error != null ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : previewUrl != null ? (
        <Image src={previewUrl} alt={entry?.name ?? 'Preview'} fit="contain" mah={480} />
      ) : null}
    </Modal>
  );
}

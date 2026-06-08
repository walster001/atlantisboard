import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';

type FileStorageDialogsProps = {
  readonly createFolderOpen: boolean;
  readonly creatingFolder: boolean;
  readonly deleteTarget: AdminFileStorageObjectEntry | null;
  readonly deletingKey: string | null;
  readonly onCloseCreateFolder: () => void;
  readonly onCloseDelete: () => void;
  readonly onCreateFolder: (folderName: string) => Promise<void>;
  readonly onConfirmDelete: (key: string) => void;
};

export function FileStorageDialogs({
  createFolderOpen,
  creatingFolder,
  deleteTarget,
  deletingKey,
  onCloseCreateFolder,
  onCloseDelete,
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
    </>
  );
}

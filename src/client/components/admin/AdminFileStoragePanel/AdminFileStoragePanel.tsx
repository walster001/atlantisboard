import { memo, useState } from 'react';
import { Box, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { FileStorageDialogs } from './FileStorageDialogs.js';
import { FileStorageObjectTable } from './FileStorageObjectTable.js';
import { FileStorageToolbar } from './FileStorageToolbar.js';
import { OrphanCleanupModal } from './OrphanCleanupModal.js';
import { useAdminFileStoragePanelState } from './useAdminFileStoragePanelState.js';
import './adminFileStoragePanel.css';

export const AdminFileStoragePanel = memo(function AdminFileStoragePanel() {
  const {
    buckets,
    selectedBucket,
    setSelectedBucket,
    entries,
    loading,
    refreshing,
    uploading,
    creatingFolder,
    deletingKey,
    downloadingKey,
    refresh,
    openFolder,
    uploadFile,
    createFolder,
    downloadObject,
    deleteObject,
  } = useAdminFileStoragePanelState();

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [orphanCleanupOpen, setOrphanCleanupOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminFileStorageObjectEntry | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AdminFileStorageObjectEntry | null>(null);

  return (
    <Stack gap="md" className="admin-file-storage-panel">
      <Stack gap={4}>
        <Title order={3}>File Storage</Title>
        <Text size="sm" c="dimmed">
          Browse and manage objects in the application MinIO buckets. Changes here affect stored
          attachments, branding assets, fonts, avatars, and other file data.
        </Text>
      </Stack>

      <Paper withBorder radius="md" p="sm" className="admin-file-storage-panel__browser">
        <Stack gap="sm" className="admin-file-storage-panel__browser-inner">
          <FileStorageToolbar
            buckets={buckets}
            selectedBucket={selectedBucket}
            refreshing={refreshing}
            uploading={uploading}
            onBucketChange={(bucket) => setSelectedBucket(bucket)}
            onRefresh={() => void refresh()}
            onOpenOrphanCleanup={() => setOrphanCleanupOpen(true)}
            onUpload={(file) => void uploadFile(file)}
            onCreateFolderClick={() => setCreateFolderOpen(true)}
          />

          <Box className="admin-file-storage-panel__table-scroll">
            <ScrollArea style={{ height: '100%' }} type="auto" offsetScrollbars>
              <FileStorageObjectTable
                entries={entries}
                loading={loading}
                deletingKey={deletingKey}
                downloadingKey={downloadingKey}
                onOpenFolder={openFolder}
                onDownload={(key) => void downloadObject(key)}
                onDelete={setDeleteTarget}
                onPreview={setPreviewTarget}
              />
            </ScrollArea>
          </Box>
        </Stack>
      </Paper>

      <OrphanCleanupModal opened={orphanCleanupOpen} onClose={() => setOrphanCleanupOpen(false)} />

      <FileStorageDialogs
        selectedBucket={selectedBucket as MinioBucketName | null}
        createFolderOpen={createFolderOpen}
        creatingFolder={creatingFolder}
        deleteTarget={deleteTarget}
        deletingKey={deletingKey}
        previewTarget={previewTarget}
        onCloseCreateFolder={() => setCreateFolderOpen(false)}
        onCloseDelete={() => setDeleteTarget(null)}
        onClosePreview={() => setPreviewTarget(null)}
        onCreateFolder={(folderName) => createFolder(folderName)}
        onConfirmDelete={(key) => void deleteObject(key)}
      />
    </Stack>
  );
});

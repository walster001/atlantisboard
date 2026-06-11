import { memo, useCallback, useState } from 'react';
import { Box, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { FileStorageDialogs } from './FileStorageDialogs.js';
import { FileStorageObjectTable } from './FileStorageObjectTable.js';
import { FileStoragePreviewPane } from './FileStoragePreviewPane.js';
import { FileStorageToolbar } from './FileStorageToolbar.js';
import { OrphanCleanupModal } from './OrphanCleanupModal.js';
import { useAdminFileStoragePanelState } from './useAdminFileStoragePanelState.js';
import './adminFileStoragePanel.css';

export const AdminFileStoragePanel = memo(function AdminFileStoragePanel() {
  const hideMetaColumns = useResponsiveTier() === 'mobile';
  const {
    buckets,
    selectedBucket,
    selectBucket,
    prefix,
    canNavigateUp,
    entries,
    loading,
    refreshing,
    uploading,
    creatingFolder,
    deletingKey,
    downloadingKey,
    refresh,
    openFolder,
    navigateUp,
    uploadFile,
    createFolder,
    downloadObject,
    deleteObject,
  } = useAdminFileStoragePanelState();

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [orphanCleanupOpen, setOrphanCleanupOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminFileStorageObjectEntry | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AdminFileStorageObjectEntry | null>(null);

  const handleOpenFolder = useCallback(
    (key: string) => {
      setSelectedEntry(null);
      openFolder(key);
    },
    [openFolder],
  );

  const handleNavigateUp = useCallback(() => {
    setSelectedEntry(null);
    navigateUp();
  }, [navigateUp]);

  const handleSelectBucket = useCallback(
    (bucket: MinioBucketName | null) => {
      setSelectedEntry(null);
      selectBucket(bucket);
    },
    [selectBucket],
  );

  const handleDelete = useCallback((entry: AdminFileStorageObjectEntry) => {
    setDeleteTarget(entry);
    if (selectedEntry?.key === entry.key) {
      setSelectedEntry(null);
    }
  }, [selectedEntry?.key]);

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
            prefix={prefix}
            canNavigateUp={canNavigateUp}
            refreshing={refreshing}
            uploading={uploading}
            onBucketChange={handleSelectBucket}
            onNavigateUp={handleNavigateUp}
            onRefresh={() => void refresh()}
            onOpenOrphanCleanup={() => setOrphanCleanupOpen(true)}
            onUpload={(file) => void uploadFile(file)}
            onCreateFolderClick={() => setCreateFolderOpen(true)}
          />

          <Box className="admin-file-storage-panel__split">
            <Box className="admin-file-storage-panel__list-column">
              <ScrollArea style={{ height: '100%' }} type="auto" offsetScrollbars>
                <FileStorageObjectTable
                  entries={entries}
                  loading={loading}
                  selectedKey={selectedEntry?.key ?? null}
                  deletingKey={deletingKey}
                  downloadingKey={downloadingKey}
                  hideMetaColumns={hideMetaColumns}
                  onOpenFolder={handleOpenFolder}
                  onSelectFile={setSelectedEntry}
                  onDownload={(key) => void downloadObject(key)}
                  onDelete={handleDelete}
                />
              </ScrollArea>
            </Box>
            <FileStoragePreviewPane
              bucket={selectedBucket as MinioBucketName | null}
              entry={selectedEntry}
              downloadingKey={downloadingKey}
              onDownload={(key) => void downloadObject(key)}
            />
          </Box>
        </Stack>
      </Paper>

      <OrphanCleanupModal opened={orphanCleanupOpen} onClose={() => setOrphanCleanupOpen(false)} />

      <FileStorageDialogs
        createFolderOpen={createFolderOpen}
        creatingFolder={creatingFolder}
        deleteTarget={deleteTarget}
        deletingKey={deletingKey}
        onCloseCreateFolder={() => setCreateFolderOpen(false)}
        onCloseDelete={() => setDeleteTarget(null)}
        onCreateFolder={(folderName) => createFolder(folderName)}
        onConfirmDelete={(key) => void deleteObject(key)}
      />
    </Stack>
  );
});

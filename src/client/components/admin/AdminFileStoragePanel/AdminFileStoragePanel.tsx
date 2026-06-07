import { memo, useState } from 'react';
import { Alert, Stack, Text, Title } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { FileStorageDialogs } from './FileStorageDialogs.js';
import { FileStorageObjectTable } from './FileStorageObjectTable.js';
import { FileStorageToolbar } from './FileStorageToolbar.js';
import { useAdminFileStoragePanelState } from './useAdminFileStoragePanelState.js';

export const AdminFileStoragePanel = memo(function AdminFileStoragePanel() {
  const {
    buckets,
    selectedBucket,
    setSelectedBucket,
    prefix,
    entries,
    loading,
    refreshing,
    uploading,
    creatingFolder,
    deletingKey,
    downloadingKey,
    refresh,
    openFolder,
    navigateToPrefix,
    uploadFile,
    createFolder,
    downloadObject,
    deleteObject,
  } = useAdminFileStoragePanelState();

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminFileStorageObjectEntry | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AdminFileStorageObjectEntry | null>(null);

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3}>File Storage</Title>
        <Text size="sm" c="dimmed">
          Browse and manage objects in the application MinIO buckets. Changes here affect stored
          attachments, branding assets, fonts, avatars, and other file data.
        </Text>
      </Stack>

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />} title="Admin access">
        Uploads are limited to 100 MB per file. Deleting folders removes all nested objects.
      </Alert>

      <FileStorageToolbar
        buckets={buckets}
        selectedBucket={selectedBucket}
        prefix={prefix}
        refreshing={refreshing}
        uploading={uploading}
        onBucketChange={(bucket) => setSelectedBucket(bucket)}
        onNavigatePrefix={navigateToPrefix}
        onRefresh={() => void refresh()}
        onUpload={(file) => void uploadFile(file)}
        onCreateFolderClick={() => setCreateFolderOpen(true)}
      />

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

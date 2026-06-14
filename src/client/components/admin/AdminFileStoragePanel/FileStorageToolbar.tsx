import {
  Button,
  FileButton,
  Group,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconFolderPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageBucketInfo } from '../../../../shared/types/adminFileStorage.js';
import { bucketSelectData } from './helpers.js';

type FileStorageToolbarProps = {
  readonly buckets: readonly AdminFileStorageBucketInfo[];
  readonly selectedBucket: MinioBucketName | null;
  readonly prefix: string;
  readonly canNavigateUp: boolean;
  readonly refreshing: boolean;
  readonly uploading: boolean;
  readonly onBucketChange: (bucket: MinioBucketName | null) => void;
  readonly onNavigateUp: () => void;
  readonly onRefresh: () => void;
  readonly onOpenOrphanCleanup: () => void;
  readonly onUpload: (file: File | null) => void;
  readonly onCreateFolderClick: () => void;
  readonly malwareScanEnabled: boolean;
  readonly malwareScanLoading: boolean;
  readonly malwareScanUpdating: boolean;
  readonly onMalwareScanChange: (enabled: boolean) => void;
};

export function FileStorageToolbar({
  buckets,
  selectedBucket,
  prefix,
  canNavigateUp,
  refreshing,
  uploading,
  onBucketChange,
  onNavigateUp,
  onRefresh,
  onOpenOrphanCleanup,
  onUpload,
  onCreateFolderClick,
  malwareScanEnabled,
  malwareScanLoading,
  malwareScanUpdating,
  onMalwareScanChange,
}: FileStorageToolbarProps) {
  const folderLabel = prefix.trim() === '' ? 'Bucket root' : prefix.replace(/\/$/, '');

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Select
          label="Bucket"
          description="Application MinIO buckets managed by this server."
          data={bucketSelectData(buckets)}
          value={selectedBucket}
          onChange={(value) => onBucketChange(value as MinioBucketName | null)}
          allowDeselect={false}
          w={{ base: '100%', sm: 320 }}
          searchable
        />
      <Group gap="xs">
        <Switch
          label="Malware Scanning Enabled"
          checked={malwareScanEnabled}
          onChange={(event) => onMalwareScanChange(event.currentTarget.checked)}
          disabled={malwareScanLoading || malwareScanUpdating}
          withThumbIndicator={false}
        />
        <Button
          variant="light"
          color="orange"
          leftSection={<IconTrash size={18} />}
          onClick={onOpenOrphanCleanup}
        >
          Cleanup orphaned files
        </Button>
        <Button
          variant="default"
          leftSection={<IconRefresh size={18} />}
          loading={refreshing}
          disabled={selectedBucket == null}
          onClick={() => void onRefresh()}
        >
          Refresh
        </Button>
        <FileButton onChange={onUpload} disabled={selectedBucket == null}>
          {(props) => (
            <Button
              {...props}
              leftSection={<IconUpload size={18} />}
              loading={uploading}
              disabled={selectedBucket == null}
            >
              Upload
            </Button>
          )}
        </FileButton>
        <Button
          variant="light"
          leftSection={<IconFolderPlus size={18} />}
          disabled={selectedBucket == null}
          onClick={onCreateFolderClick}
        >
          New folder
        </Button>
      </Group>
      </Group>
      {canNavigateUp ? (
        <Group gap="xs" wrap="nowrap">
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconArrowLeft size={16} />}
            onClick={onNavigateUp}
          >
            Back
          </Button>
          <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
            {folderLabel}
          </Text>
        </Group>
      ) : null}
    </Stack>
  );
}

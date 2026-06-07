import {
  Anchor,
  Breadcrumbs,
  Button,
  FileButton,
  Group,
  Select,
  Stack,
} from '@mantine/core';
import {
  IconFolderPlus,
  IconRefresh,
  IconUpload,
} from '@tabler/icons-react';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageBucketInfo } from '../../../../shared/types/adminFileStorage.js';
import { bucketSelectData, buildPrefixBreadcrumbs } from './helpers.js';

type FileStorageToolbarProps = {
  readonly buckets: readonly AdminFileStorageBucketInfo[];
  readonly selectedBucket: MinioBucketName | null;
  readonly prefix: string;
  readonly refreshing: boolean;
  readonly uploading: boolean;
  readonly onBucketChange: (bucket: MinioBucketName | null) => void;
  readonly onNavigatePrefix: (prefix: string) => void;
  readonly onRefresh: () => void;
  readonly onUpload: (file: File | null) => void;
  readonly onCreateFolderClick: () => void;
};

export function FileStorageToolbar({
  buckets,
  selectedBucket,
  prefix,
  refreshing,
  uploading,
  onBucketChange,
  onNavigatePrefix,
  onRefresh,
  onUpload,
  onCreateFolderClick,
}: FileStorageToolbarProps) {
  const breadcrumbs = buildPrefixBreadcrumbs(prefix);

  return (
    <Stack gap="sm">
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

      <Breadcrumbs separator="/">
        {breadcrumbs.map((crumb) => {
          const isActive = crumb.prefix === prefix;
          return (
            <Anchor
              key={crumb.prefix || 'root'}
              component="button"
              type="button"
              size="sm"
              {...(isActive ? {} : { c: 'dimmed' as const })}
              fw={isActive ? 600 : 400}
              onClick={() => onNavigatePrefix(crumb.prefix)}
            >
              {crumb.label}
            </Anchor>
          );
        })}
      </Breadcrumbs>
    </Stack>
  );
}

import { memo, type ChangeEvent } from 'react';
import { Checkbox, SegmentedControl, Stack, Text } from '@mantine/core';
import {
  BACKUP_MINIO_PREFIX_OPTIONS,
  BACKUP_SCOPE_SEGMENT_OPTIONS,
  type AdminBackupScope,
} from '../../../../shared/constants/backupScope.js';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';

interface BackupScopeFieldsProps {
  readonly scope: AdminBackupScope;
  readonly onScopeChange: (next: AdminBackupScope) => void;
  readonly minioPrefixes: readonly MinioBucketName[];
  readonly onMinioPrefixesChange: (next: readonly MinioBucketName[]) => void;
  readonly disabled?: boolean;
}

export const BackupScopeFields = memo(function BackupScopeFields({
  scope,
  onScopeChange,
  minioPrefixes,
  onMinioPrefixesChange,
  disabled = false,
}: BackupScopeFieldsProps) {
  const attachmentsEnabled = scope === 'database_and_attachments';

  const togglePrefix = (bucket: MinioBucketName, checked: boolean): void => {
    if (checked) {
      if (minioPrefixes.includes(bucket)) {
        return;
      }
      onMinioPrefixesChange([...minioPrefixes, bucket]);
      return;
    }
    onMinioPrefixesChange(minioPrefixes.filter((value) => value !== bucket));
  };

  return (
    <Stack gap="sm">
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Backup scope
        </Text>
        <SegmentedControl
          value={scope}
          onChange={(value) => onScopeChange(value as AdminBackupScope)}
          data={BACKUP_SCOPE_SEGMENT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          disabled={disabled}
          fullWidth
          aria-label="Backup scope"
        />
        <Text size="xs" c="dimmed">
          Database-only backups skip MinIO object storage. Attachments mode exports selected storage folders.
        </Text>
      </Stack>
      {attachmentsEnabled ? (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            MinIO storage folders
          </Text>
          {BACKUP_MINIO_PREFIX_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              description={option.description}
              checked={minioPrefixes.includes(option.value)}
              disabled={disabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                togglePrefix(option.value, event.currentTarget.checked)
              }
            />
          ))}
          {minioPrefixes.length === 0 ? (
            <Text size="xs" c="red">
              Select at least one storage folder.
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
});

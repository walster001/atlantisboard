import { memo } from 'react';
import { Alert, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconFolder, IconFolderPlus } from '@tabler/icons-react';
import { BACKUP_LOCATION_ENV_NAME } from '../../../../shared/constants/backupLocationEnv.js';
import type { AdminBackupLocationCheckResult } from '../../../../shared/types/adminBackupLocation.js';

interface BackupLocationSectionProps {
  readonly locationInput: string;
  readonly setLocationInput: (value: string) => void;
  readonly defaultLocation: string;
  readonly backupLocationConfigured: boolean;
  readonly locationCheck: AdminBackupLocationCheckResult | null;
  readonly checkingLocation: boolean;
  readonly savingLocation: boolean;
  readonly onCheckLocation: () => Promise<void>;
  readonly onSaveLocation: () => Promise<void>;
}

export const BackupLocationSection = memo(function BackupLocationSection({
  locationInput,
  setLocationInput,
  defaultLocation,
  backupLocationConfigured,
  locationCheck,
  checkingLocation,
  savingLocation,
  onCheckLocation,
  onSaveLocation,
}: BackupLocationSectionProps) {
  const checkedPath = locationInput.trim();

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Backup path ({BACKUP_LOCATION_ENV_NAME})
      </Text>
      <Text size="sm" c="dimmed">
        Absolute directory on the server where backup ZIP archives are stored. Saving updates the running
        server and your deployment <Text span ff="monospace">.env</Text> when writable.
      </Text>
      <Group align="flex-end" wrap="wrap">
        <TextInput
          label="Path"
          placeholder="/var/backups/atlboard"
          value={locationInput}
          onChange={(event) => setLocationInput(event.currentTarget.value)}
          style={{ flex: '1 1 280px' }}
          disabled={checkingLocation || savingLocation}
        />
        <Button
          variant="default"
          loading={checkingLocation}
          leftSection={<IconFolder size={16} />}
          onClick={() => void onCheckLocation()}
        >
          Check path
        </Button>
        <Button
          loading={savingLocation}
          leftSection={<IconFolderPlus size={16} />}
          onClick={() => void onSaveLocation()}
        >
          Save path
        </Button>
      </Group>

      {backupLocationConfigured ? (
        <Group gap="xs">
          <Badge color="green" variant="light">
            Active
          </Badge>
          <Text size="sm" ff="monospace">
            {defaultLocation}
          </Text>
        </Group>
      ) : (
        <Alert color="yellow" title="Backup path not configured">
          Set an absolute path and save before creating backups.
        </Alert>
      )}

      {locationCheck != null && locationCheck.path === checkedPath ? (
        <Text size="sm" c={locationCheck.exists && locationCheck.writable ? 'green' : 'dimmed'}>
          {locationCheck.exists
            ? locationCheck.isDirectory
              ? locationCheck.writable
                ? 'Path exists and is writable.'
                : 'Path exists but is not writable by the server process.'
              : 'Path exists but is not a directory.'
            : 'Path does not exist on the server yet.'}
        </Text>
      ) : null}
    </Stack>
  );
});

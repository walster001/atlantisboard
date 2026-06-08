import { memo } from 'react';
import { Select, Stack, Text } from '@mantine/core';
import { type RoleKey } from '../../../shared/permissions/catalog.js';

function roleLabelForKey(
  roleKey: string,
  roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>,
): string {
  return roleOptions.find((option) => option.value === roleKey)?.label ?? roleKey;
}

export const PlaceholderImportRoleCell = memo(function PlaceholderImportRoleCell(props: {
  readonly importRoleKey: string;
  readonly targetRoleKey: RoleKey;
  readonly roleOptions: ReadonlyArray<{ value: RoleKey; label: string }>;
  readonly canUpdateRole: boolean;
  readonly onTargetRoleChange: (next: RoleKey) => void;
  readonly compactLayout?: boolean;
}) {
  const {
    importRoleKey,
    targetRoleKey,
    roleOptions,
    canUpdateRole,
    onTargetRoleChange,
    compactLayout = false,
  } = props;
  const importLabel = roleLabelForKey(importRoleKey, roleOptions);

  if (!canUpdateRole) {
    return (
      <Stack gap={2}>
        <Text size="xs" c="dimmed" lh={1.3}>
          Imported as
        </Text>
        <Text size="sm" fw={500} lh={1.35}>
          {importLabel}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={compactLayout ? 4 : 6}>
      <Stack gap={2}>
        <Text size="xs" c="dimmed" lh={1.3}>
          Imported as
        </Text>
        <Text size="sm" fw={500} lh={1.35}>
          {importLabel}
        </Text>
      </Stack>
      <Select
        size="xs"
        w="100%"
        label={compactLayout ? undefined : 'On sign-in'}
        aria-label="Role on sign-in"
        value={targetRoleKey}
        onChange={(value) => {
          if (value) {
            onTargetRoleChange(value as RoleKey);
          }
        }}
        data={roleOptions}
        comboboxProps={{ withinPortal: false }}
      />
    </Stack>
  );
});

import { Alert, Box, Card, Grid, Group, Stack, Switch, Text } from '@mantine/core';
import type { ReactElement } from 'react';
import { categoryLabel } from './categoryMeta.js';
import { MembersRoleUpdateModePicker } from './MembersRoleUpdateModePicker.js';
import { PERMISSION_DESCRIPTIONS } from './permissionsCatalog.js';
import { TriStateCategoryToggle } from './TriStateCategoryToggle.js';
import type { CategoryStatus, PermissionCategoryKey, RoleRow } from './types.js';

interface PermissionMatrixProps {
  readonly activeRole: RoleRow | null;
  readonly activeCategory: PermissionCategoryKey;
  readonly categoryStatuses: ReadonlyMap<PermissionCategoryKey, CategoryStatus>;
  readonly allPermissionStrings: readonly string[];
  readonly permissionKeysByCategory: ReadonlyMap<PermissionCategoryKey, readonly string[]>;
  readonly activeEnabledSet: ReadonlySet<string>;
  readonly activeMemberRoleUpdateMode: string | null;
  readonly setMemberRoleUpdateMode: (roleKey: string, modeKey: string | null) => void;
  readonly setAllPermissionsForActiveCategory: (enabled: boolean) => void;
  readonly togglePermission: (roleKey: string, permission: string) => void;
  readonly layout: 'stack' | 'grid';
}

export function PermissionMatrix({
  activeRole,
  activeCategory,
  categoryStatuses,
  allPermissionStrings,
  permissionKeysByCategory,
  activeEnabledSet,
  activeMemberRoleUpdateMode,
  setMemberRoleUpdateMode,
  setAllPermissionsForActiveCategory,
  togglePermission,
  layout,
}: PermissionMatrixProps): ReactElement {
  if (!activeRole) {
    return <Text c="dimmed">Select a role.</Text>;
  }
  if (allPermissionStrings.length === 0) {
    return (
      <Alert color="yellow" title="Permissions">
        No permissions found.
      </Alert>
    );
  }

  const categoryToggle = (
    <Card withBorder radius="md" p="sm">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Box style={{ minWidth: 0 }}>
          <Text fw={700} size="sm" lineClamp={1}>
            {categoryLabel(activeCategory)}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            Toggle all permissions in this category.
          </Text>
        </Box>
        <TriStateCategoryToggle
          status={categoryStatuses.get(activeCategory) ?? 'none'}
          disabled={activeRole.isBuiltIn}
          onToggleAllOn={() => setAllPermissionsForActiveCategory(true)}
          onToggleAllOff={() => setAllPermissionsForActiveCategory(false)}
        />
      </Group>
    </Card>
  );

  const membersMode =
    activeCategory === 'members' ? (
      <MembersRoleUpdateModePicker
        activeRole={activeRole}
        activeMemberRoleUpdateMode={activeMemberRoleUpdateMode}
        activeEnabledSet={activeEnabledSet}
        setMemberRoleUpdateMode={setMemberRoleUpdateMode}
        layout={layout === 'grid' ? 'inline' : 'stack'}
      />
    ) : null;

  const permissionCards = (permissionKeysByCategory.get(activeCategory) ?? []).map((permission) => {
    const card = (
      <Card key={permission} withBorder radius="md" p="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} size="sm" lineClamp={1}>
              {permission}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={layout === 'grid' ? 2 : 3}>
              {PERMISSION_DESCRIPTIONS[permission] ?? 'No description available.'}
            </Text>
          </Box>
          <Switch
            size="md"
            checked={activeEnabledSet.has(permission)}
            disabled={activeRole.isBuiltIn}
            onChange={() => togglePermission(activeRole.key, permission)}
            aria-label={`Toggle ${permission}`}
            withThumbIndicator={false}
          />
        </Group>
      </Card>
    );
    if (layout === 'grid') {
      return (
        <Grid.Col key={permission} span={{ base: 12, md: 6 }}>
          {card}
        </Grid.Col>
      );
    }
    return card;
  });

  if (layout === 'grid') {
    return (
      <Grid gutter="xs" pr="sm">
        <Grid.Col span={12}>{categoryToggle}</Grid.Col>
        {membersMode != null ? <Grid.Col span={12}>{membersMode}</Grid.Col> : null}
        {permissionCards}
      </Grid>
    );
  }

  return (
    <Stack gap="xs">
      {categoryToggle}
      {membersMode}
      {permissionCards}
    </Stack>
  );
}

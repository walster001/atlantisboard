import { Box, Card, Group, Select, Stack, Switch, Text } from '@mantine/core';
import type { ReactElement } from 'react';
import { MEMBERS_ROLE_UPDATE_MODE_OPTIONS } from './permissionsCatalog.js';
import type { RoleRow } from './types.js';

interface MembersRoleUpdateModePickerProps {
  readonly activeRole: RoleRow;
  readonly activeMemberRoleUpdateMode: string | null;
  readonly activeEnabledSet: ReadonlySet<string>;
  readonly setMemberRoleUpdateMode: (roleKey: string, modeKey: string | null) => void;
  readonly layout: 'stack' | 'inline';
}

export function MembersRoleUpdateModePicker({
  activeRole,
  activeMemberRoleUpdateMode,
  activeEnabledSet,
  setMemberRoleUpdateMode,
  layout,
}: MembersRoleUpdateModePickerProps): ReactElement {
  const roleUpdateDisabled = activeRole.isBuiltIn || !activeEnabledSet.has('boards.members.role.update');

  if (layout === 'stack') {
    return (
      <Card withBorder radius="md" p="sm">
        <Stack gap="sm">
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} size="sm" lineClamp={1}>
              Board member role update mode
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              Choose exactly one hierarchy rule for board member role updates.
            </Text>
          </Box>
          <Select
            size="sm"
            data={[...MEMBERS_ROLE_UPDATE_MODE_OPTIONS]}
            value={activeMemberRoleUpdateMode}
            onChange={(value) => setMemberRoleUpdateMode(activeRole.key, value)}
            disabled={roleUpdateDisabled}
            allowDeselect={false}
          />
          <Switch
            size="md"
            label="Enable role update mode"
            checked={activeMemberRoleUpdateMode != null}
            disabled={activeRole.isBuiltIn}
            onChange={(event) => {
              if (event.currentTarget.checked) {
                const fallback =
                  activeMemberRoleUpdateMode ?? MEMBERS_ROLE_UPDATE_MODE_OPTIONS[0]?.value ?? null;
                setMemberRoleUpdateMode(activeRole.key, fallback);
              } else {
                setMemberRoleUpdateMode(activeRole.key, null);
              }
            }}
            aria-label="Toggle board member role update mode"
            withThumbIndicator={false}
          />
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" p="sm">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" lineClamp={1}>
            Board member role update mode
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            Choose exactly one hierarchy rule for board member role updates.
          </Text>
        </Box>
        <Group gap="sm" wrap="nowrap" align="center">
          <Select
            size="xs"
            w={280}
            data={[...MEMBERS_ROLE_UPDATE_MODE_OPTIONS]}
            value={activeMemberRoleUpdateMode}
            onChange={(value) => setMemberRoleUpdateMode(activeRole.key, value)}
            disabled={roleUpdateDisabled}
            allowDeselect={false}
          />
          <Switch
            size="md"
            checked={activeMemberRoleUpdateMode != null}
            disabled={activeRole.isBuiltIn}
            onChange={(event) => {
              if (event.currentTarget.checked) {
                const fallback =
                  activeMemberRoleUpdateMode ?? MEMBERS_ROLE_UPDATE_MODE_OPTIONS[0]?.value ?? null;
                setMemberRoleUpdateMode(activeRole.key, fallback);
              } else {
                setMemberRoleUpdateMode(activeRole.key, null);
              }
            }}
            aria-label="Toggle board member role update mode"
            withThumbIndicator={false}
          />
        </Group>
      </Group>
    </Card>
  );
}

import { memo } from 'react';
import { Box, Button, Divider, Group, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import {
  formatAuthProvider,
  formatDateTime,
  type AdminUserRow,
  type UserCapabilityDraft,
} from './adminUsersTabUtils.js';
import { renderUserCapabilityCheckbox } from './AdminUsersCapabilityFields.js';

type AdminUsersMobileCardProps = {
  readonly user: AdminUserRow;
  readonly draft: UserCapabilityDraft;
  readonly isCurrentUser: boolean;
  readonly onImportChange: (userId: string, checked: boolean) => void;
  readonly onCreateWorkspaceChange: (userId: string, checked: boolean) => void;
  readonly onDeleteClick: (user: AdminUserRow) => void;
};

function MobileDetailField(props: { readonly label: string; readonly value: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" fw={600}>
        {props.label}
      </Text>
      <Text size="sm" style={{ wordBreak: 'break-word' }}>
        {props.value}
      </Text>
    </Stack>
  );
}

export const AdminUsersMobileCard = memo(function AdminUsersMobileCard({
  user,
  draft,
  isCurrentUser,
  onImportChange,
  onCreateWorkspaceChange,
  onDeleteClick,
}: AdminUsersMobileCardProps) {
  const deleteButton = (
    <Button
      size="xs"
      color="red"
      variant="light"
      disabled={isCurrentUser}
      onClick={() => onDeleteClick(user)}
    >
      Delete
    </Button>
  );

  return (
    <Paper withBorder radius="md" p="sm" className="admin-users-tab__mobile-card">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" style={{ wordBreak: 'break-word' }}>
              {user.displayName}
            </Text>
            <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
              {user.email}
            </Text>
            <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>
              {user.username}
            </Text>
          </Stack>
          {isCurrentUser ? (
            <Tooltip label="You cannot delete the account currently in use." position="left">
              <span>{deleteButton}</span>
            </Tooltip>
          ) : (
            deleteButton
          )}
        </Group>

        <SimpleGrid cols={2} spacing="xs" verticalSpacing="sm">
          <MobileDetailField label="App Admin" value={user.isAppAdmin ? 'Yes' : 'No'} />
          <MobileDetailField label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
          <MobileDetailField label="Created" value={formatDateTime(user.createdAt)} />
          <MobileDetailField label="Last login" value={formatDateTime(user.lastLogin)} />
          <Box style={{ gridColumn: '1 / -1' }}>
            <MobileDetailField label="Auth provider" value={formatAuthProvider(user.authProvider)} />
          </Box>
        </SimpleGrid>

        <Divider />

        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              Import boards
            </Text>
            {renderUserCapabilityCheckbox(user, 'canImportBoards', draft.canImportBoards, onImportChange)}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              Create workspace
            </Text>
            {renderUserCapabilityCheckbox(
              user,
              'canCreateWorkspace',
              draft.canCreateWorkspace,
              onCreateWorkspaceChange,
            )}
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
});

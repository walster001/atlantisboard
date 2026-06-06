import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { AdminUserRow } from './adminUsersTabUtils.js';

interface AdminUsersDeleteModalProps {
  readonly confirmDeleteUser: AdminUserRow | null;
  readonly deletingUserId: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AdminUsersDeleteModal({
  confirmDeleteUser,
  deletingUserId,
  onClose,
  onConfirm,
}: AdminUsersDeleteModalProps) {
  return (
    <Modal
      opened={confirmDeleteUser != null}
      onClose={onClose}
      title="Confirm master delete"
      centered
    >
      <Stack gap="sm">
        <Alert color="red" variant="light">
          This will run a permanent master delete: remove this user from all boards/workspaces, purge their user data, and delete their account.
        </Alert>
        {confirmDeleteUser ? (
          <Text size="sm">
            User: <strong>{confirmDeleteUser.displayName}</strong> ({confirmDeleteUser.email})
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deletingUserId != null}
            onClick={onConfirm}
          >
            Yes, master delete user
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

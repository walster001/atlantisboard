import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { formatBoardOwner, formatBoardWorkspace, type AdminBoardListRow } from './adminReportingBoardListUtils.js';

interface AdminReportingBoardListDeleteModalProps {
  readonly confirmDeleteBoard: AdminBoardListRow | null;
  readonly deletingBoardId: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AdminReportingBoardListDeleteModal({
  confirmDeleteBoard,
  deletingBoardId,
  onClose,
  onConfirm,
}: AdminReportingBoardListDeleteModalProps) {
  return (
    <Modal
      opened={confirmDeleteBoard != null}
      onClose={onClose}
      title="Confirm master delete"
      centered
    >
      <Stack gap="sm">
        <Alert color="red" variant="light">
          This will permanently delete the board and run the normal board cleanup workflow: cards,
          lists, attachments, activity logs, and related storage will be removed.
        </Alert>
        {confirmDeleteBoard != null ? (
          <Stack gap={4}>
            <Text size="sm">
              Board: <strong>{confirmDeleteBoard.name}</strong>
            </Text>
            <Text size="sm" c="dimmed">
              Workspace: {formatBoardWorkspace(confirmDeleteBoard)}
            </Text>
            <Text size="sm" c="dimmed">
              Owner: {formatBoardOwner(confirmDeleteBoard)}
            </Text>
          </Stack>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={deletingBoardId != null}>
            Cancel
          </Button>
          <Button color="red" loading={deletingBoardId != null} onClick={onConfirm}>
            Yes, master delete board
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

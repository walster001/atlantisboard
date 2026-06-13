import { notifications } from '@mantine/notifications';
import { useCallback, useState } from 'react';
import { api } from '../../../utils/api.js';
import type { AdminBoardListRow } from './adminReportingBoardListUtils.js';

interface UseAdminReportingBoardListMasterDeleteOptions {
  readonly onBoardDeleted: (boardId: string) => void;
}

export function useAdminReportingBoardListMasterDelete({
  onBoardDeleted,
}: UseAdminReportingBoardListMasterDeleteOptions) {
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState<AdminBoardListRow | null>(null);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);

  const handleDeleteClick = useCallback((board: AdminBoardListRow): void => {
    setConfirmDeleteBoard(board);
  }, []);

  const handleDeleteClose = useCallback((): void => {
    if (deletingBoardId != null) {
      return;
    }
    setConfirmDeleteBoard(null);
  }, [deletingBoardId]);

  const handleDeleteConfirmed = useCallback(async (): Promise<void> => {
    if (confirmDeleteBoard == null) {
      return;
    }
    setDeletingBoardId(confirmDeleteBoard._id);
    try {
      await api.deleteAdminReportingBoard(confirmDeleteBoard._id);
      onBoardDeleted(confirmDeleteBoard._id);
      notifications.show({
        color: 'green',
        title: 'Board deleted',
        message: `${confirmDeleteBoard.name} was removed successfully.`,
      });
      setConfirmDeleteBoard(null);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Could not delete board',
        message: e instanceof Error ? e.message : 'Master delete failed.',
      });
    } finally {
      setDeletingBoardId(null);
    }
  }, [confirmDeleteBoard, onBoardDeleted]);

  return {
    confirmDeleteBoard,
    deletingBoardId,
    handleDeleteClick,
    handleDeleteClose,
    handleDeleteConfirmed,
  };
}

import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import { sortDirectoryUserRows } from '../members/memberDirectoryUtils.js';
import { type RoleKey } from '../../../shared/permissions/catalog.js';
import {
  extractUser,
  sortBoardMembersByDisplayName,
  type BoardMember,
  type BoardPayload,
  type UserRow,
} from '../../components/board/BoardMemberTableParts.js';

export interface UseBoardMemberMutationsOptions {
  readonly boardId: string;
  readonly canAddMember: boolean;
  readonly canRemoveMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly boardRef: React.MutableRefObject<BoardPayload | null>;
  readonly addRolesRef: React.MutableRefObject<Record<string, RoleKey>>;
  readonly directoryUsersRef: React.MutableRefObject<UserRow[]>;
  readonly setBoard: React.Dispatch<React.SetStateAction<BoardPayload | null>>;
  readonly setDirectoryUsers: React.Dispatch<React.SetStateAction<UserRow[]>>;
  readonly loadBoard: (cursor?: string, opts?: { readonly quiet?: boolean }) => Promise<void>;
}

export function useBoardMemberMutations({
  boardId,
  canAddMember,
  canRemoveMember,
  canUpdateMemberRole,
  boardRef,
  addRolesRef,
  directoryUsersRef,
  setBoard,
  setDirectoryUsers,
  loadBoard,
}: UseBoardMemberMutationsOptions) {
  const handleDiscardAllPlaceholders = useCallback(async (): Promise<void> => {
    if (!canRemoveMember) {
      return;
    }
    try {
      const result = await api.discardBoardImportPlaceholders(boardId);
      setDirectoryUsers((prev) => prev.filter((u) => u.importPlaceholder !== true));
      setBoard((prev) => {
        if (prev === null) {
          return prev;
        }
        return {
          ...prev,
          members: (prev.members ?? []).filter((m) => {
            const u = extractUser(m.userId);
            return u.importPlaceholder !== true;
          }),
        };
      });
      void loadBoard();
      notifications.show({
        color: 'green',
        title: 'Placeholders discarded',
        message:
          result.removedCount > 0
            ? `Removed ${result.removedCount} placeholder user${result.removedCount === 1 ? '' : 's'} from this board.`
            : 'No placeholder users were removed.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not discard placeholders',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [boardId, canRemoveMember, loadBoard, setBoard, setDirectoryUsers]);

  const handleAddUser = useCallback(
    async (userId: string) => {
      if (!canAddMember) {
        return;
      }
      const roleKey = addRolesRef.current[userId] ?? 'viewer';
      const row = directoryUsersRef.current.find((u) => u._id === userId);
      if (row === undefined) {
        return;
      }
      const userSnapshot = row;

      setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));

      setBoard((prev) => {
        if (prev === null) {
          return prev;
        }
        if ((prev.members ?? []).some((m) => extractUser(m.userId)._id === userId)) {
          return prev;
        }
        return {
          ...prev,
          members: sortBoardMembersByDisplayName([
            ...(prev.members ?? []),
            { userId: userSnapshot, roleKey },
          ]),
        };
      });

      try {
        await api.addBoardMember(boardId, userId, roleKey);
        notifications.show({
          color: 'green',
          title: 'Member added',
          message: 'User was added to this board.',
        });
      } catch (error) {
        setBoard((prev) => {
          if (prev === null) {
            return prev;
          }
          return {
            ...prev,
            members: (prev.members ?? []).filter((m) => extractUser(m.userId)._id !== userId),
          };
        });
        setDirectoryUsers((prev) => {
          if (prev.some((u) => u._id === userId)) {
            return prev;
          }
          return sortDirectoryUserRows([...prev, userSnapshot]);
        });
        notifications.show({
          color: 'red',
          title: 'Could not add member',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [addRolesRef, boardId, canAddMember, directoryUsersRef, setBoard, setDirectoryUsers],
  );

  const handleRemoveMember = useCallback(
    (userId: string) => {
      if (!canRemoveMember) {
        return;
      }
      const snapshot = boardRef.current;
      const found = snapshot?.members?.find((m) => extractUser(m.userId)._id === userId);
      if (found === undefined) {
        return;
      }
      const removedUserRow = extractUser(found.userId);

      setBoard((prev) => {
        if (prev === null || prev.members === undefined) {
          return prev;
        }
        return {
          ...prev,
          members: prev.members.filter((m) => extractUser(m.userId)._id !== userId),
        };
      });

      setDirectoryUsers((prev) => {
        if (prev.some((u) => u._id === userId)) {
          return prev;
        }
        return sortDirectoryUserRows([removedUserRow, ...prev]);
      });

      void (async () => {
        try {
          await api.removeBoardMember(boardId, userId);
          notifications.show({
            color: 'green',
            title: 'Member removed',
            message: 'User was removed from this board.',
          });
        } catch (error) {
          setBoard((prev) => {
            if (prev === null) {
              return prev;
            }
            if ((prev.members ?? []).some((m) => extractUser(m.userId)._id === userId)) {
              return prev;
            }
            return {
              ...prev,
              members: sortBoardMembersByDisplayName([...(prev.members ?? []), found]),
            };
          });
          setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));
          notifications.show({
            color: 'red',
            title: 'Could not remove member',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
    },
    [boardId, boardRef, canRemoveMember, setBoard, setDirectoryUsers],
  );

  const handleRoleChange = useCallback(
    async (userId: string, roleKey: RoleKey) => {
      if (!canUpdateMemberRole) {
        return;
      }
      const current = boardRef.current?.members?.find((m) => extractUser(m.userId)._id === userId);
      const previousRoleKey = current?.roleKey;
      if (previousRoleKey === undefined || previousRoleKey === roleKey) {
        return;
      }

      setBoard((prev) => {
        if (prev === null || prev.members === undefined) {
          return prev;
        }
        return {
          ...prev,
          members: prev.members.map((m) =>
            extractUser(m.userId)._id === userId ? { ...m, roleKey } : m,
          ),
        };
      });

      try {
        await api.updateBoardMemberRole(boardId, userId, roleKey);
      } catch (error) {
        setBoard((prev) => {
          if (prev === null || prev.members === undefined) {
            return prev;
          }
          return {
            ...prev,
            members: prev.members.map((m) =>
              extractUser(m.userId)._id === userId
                ? { ...m, roleKey: previousRoleKey }
                : m,
            ),
          };
        });
        notifications.show({
          color: 'red',
          title: 'Could not update role',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [boardId, boardRef, canUpdateMemberRole, setBoard],
  );

  const onMemberRoleChange = useCallback(
    (userId: string, roleKey: RoleKey) => {
      void handleRoleChange(userId, roleKey);
    },
    [handleRoleChange],
  );

  return {
    handleDiscardAllPlaceholders,
    handleAddUser,
    handleRemoveMember,
    onMemberRoleChange,
  };
}

export type { BoardMember };

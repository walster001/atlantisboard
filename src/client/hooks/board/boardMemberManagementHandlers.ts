import { notifications } from '@mantine/notifications';
import { type RoleKey } from '../../../shared/permissions/catalog.js';
import {
  extractUser,
  sortBoardMembersByDisplayName,
  type BoardPayload,
  type UserRow,
} from '../../components/board/BoardMemberTableParts.js';
import { sortDirectoryUserRows } from '../members/memberDirectoryUtils.js';
import { api } from '../../utils/api.js';

export interface BoardMemberManagementHandlerDeps {
  readonly boardId: string;
  readonly canAddMember: boolean;
  readonly canRemoveMember: boolean;
  readonly canUpdateMemberRole: boolean;
  readonly addRolesRef: { readonly current: Record<string, RoleKey> };
  readonly directoryUsersRef: { readonly current: UserRow[] };
  readonly boardRef: { readonly current: BoardPayload | null };
  readonly setDirectoryUsers: React.Dispatch<React.SetStateAction<UserRow[]>>;
  readonly setBoard: React.Dispatch<React.SetStateAction<BoardPayload | null>>;
  readonly setAddRoles: React.Dispatch<React.SetStateAction<Record<string, RoleKey>>>;
  readonly setDiscardPlaceholdersOpen: (open: boolean) => void;
  readonly setDiscardingPlaceholders: (value: boolean) => void;
  readonly loadBoard: (cursor?: string, opts?: { readonly quiet?: boolean }) => Promise<void>;
}

export async function discardAllBoardImportPlaceholders(
  deps: BoardMemberManagementHandlerDeps,
): Promise<void> {
  if (!deps.canRemoveMember) {
    return;
  }
  deps.setDiscardingPlaceholders(true);
  try {
    const result = await api.discardBoardImportPlaceholders(deps.boardId);
    deps.setDiscardPlaceholdersOpen(false);
    deps.setDirectoryUsers((prev) => prev.filter((u) => u.importPlaceholder !== true));
    deps.setBoard((prev) => {
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
    void deps.loadBoard();
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
  } finally {
    deps.setDiscardingPlaceholders(false);
  }
}

export function changeDirectoryAddRole(
  deps: Pick<BoardMemberManagementHandlerDeps, 'canUpdateMemberRole' | 'setAddRoles'>,
  userId: string,
  roleKey: RoleKey,
): void {
  if (!deps.canUpdateMemberRole) {
    return;
  }
  deps.setAddRoles((prev) => ({ ...prev, [userId]: roleKey }));
}

export async function addBoardMemberFromDirectory(
  deps: BoardMemberManagementHandlerDeps,
  userId: string,
): Promise<void> {
  if (!deps.canAddMember) {
    return;
  }
  const roleKey = deps.addRolesRef.current[userId] ?? 'viewer';
  const row = deps.directoryUsersRef.current.find((u) => u._id === userId);
  if (row === undefined) {
    return;
  }
  const userSnapshot = row;

  deps.setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));

  deps.setBoard((prev) => {
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
    await api.addBoardMember(deps.boardId, userId, roleKey);
    notifications.show({
      color: 'green',
      title: 'Member added',
      message: 'User was added to this board.',
    });
  } catch (error) {
    deps.setBoard((prev) => {
      if (prev === null) {
        return prev;
      }
      return {
        ...prev,
        members: (prev.members ?? []).filter((m) => extractUser(m.userId)._id !== userId),
      };
    });
    deps.setDirectoryUsers((prev) => {
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
}

export function removeBoardMemberOptimistic(
  deps: BoardMemberManagementHandlerDeps,
  userId: string,
): void {
  if (!deps.canRemoveMember) {
    return;
  }
  const snapshot = deps.boardRef.current;
  const found = snapshot?.members?.find((m) => extractUser(m.userId)._id === userId);
  if (found === undefined) {
    return;
  }
  const removedUserRow = extractUser(found.userId);

  deps.setBoard((prev) => {
    if (prev === null || prev.members === undefined) {
      return prev;
    }
    return {
      ...prev,
      members: prev.members.filter((m) => extractUser(m.userId)._id !== userId),
    };
  });

  deps.setDirectoryUsers((prev) => {
    if (prev.some((u) => u._id === userId)) {
      return prev;
    }
    return sortDirectoryUserRows([removedUserRow, ...prev]);
  });

  void (async () => {
    try {
      await api.removeBoardMember(deps.boardId, userId);
      notifications.show({
        color: 'green',
        title: 'Member removed',
        message: 'User was removed from this board.',
      });
    } catch (error) {
      deps.setBoard((prev) => {
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
      deps.setDirectoryUsers((prev) => prev.filter((u) => u._id !== userId));
      notifications.show({
        color: 'red',
        title: 'Could not remove member',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })();
}

export async function updateBoardMemberRole(
  deps: BoardMemberManagementHandlerDeps,
  userId: string,
  roleKey: RoleKey,
): Promise<void> {
  if (!deps.canUpdateMemberRole) {
    return;
  }
  const current = deps.boardRef.current?.members?.find((m) => extractUser(m.userId)._id === userId);
  const previousRoleKey = current?.roleKey;
  if (previousRoleKey === undefined || previousRoleKey === roleKey) {
    return;
  }

  deps.setBoard((prev) => {
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
    await api.updateBoardMemberRole(deps.boardId, userId, roleKey);
  } catch (error) {
    deps.setBoard((prev) => {
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
}

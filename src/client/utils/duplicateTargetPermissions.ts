import type { BoardPermissionKey } from '../hooks/useBoardPermissions.js';

export const DUPLICATE_LIST_TARGET_BOARD_PERMISSIONS = ['boards.view', 'lists.create'] as const satisfies readonly BoardPermissionKey[];

export const DUPLICATE_CARD_TARGET_BOARD_PERMISSIONS = ['boards.view', 'cards.create'] as const satisfies readonly BoardPermissionKey[];

export type DuplicateTargetKind = 'list' | 'card';

export const DUPLICATE_TARGET_BOARD_PERMISSIONS_BY_KIND: Record<
  DuplicateTargetKind,
  readonly BoardPermissionKey[]
> = {
  list: DUPLICATE_LIST_TARGET_BOARD_PERMISSIONS,
  card: DUPLICATE_CARD_TARGET_BOARD_PERMISSIONS,
};

export function boardAllowsDuplicateTarget(
  boardId: string,
  ownerId: string | undefined,
  userId: string | undefined,
  can: (boardId: string, key: BoardPermissionKey) => boolean,
  requiredPermissions: readonly BoardPermissionKey[],
): boolean {
  if (userId != null && userId !== '' && ownerId != null && ownerId !== '' && ownerId === userId) {
    return true;
  }
  return requiredPermissions.every((key) => can(boardId, key));
}

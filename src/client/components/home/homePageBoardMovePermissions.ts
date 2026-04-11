import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import { boardWorkspaceKey } from '../../hooks/homeBoard/homeBoardLayout.js';

export function canUserEditBoard(userId: string, board: BoardDB): boolean {
  if (board.ownerId === userId) {
    return true;
  }
  const roleKey = board.members.find((m) => m.userId === userId)?.roleKey;
  return roleKey === 'admin' || roleKey === 'manager';
}

export function canReorderAllBoardsInScope(userId: string, boards: BoardDB[]): boolean {
  if (boards.length === 0) {
    return false;
  }
  return boards.every((b) => canUserEditBoard(userId, b));
}

function canManageWorkspaceForBoardMoves(
  userId: string,
  workspace: WorkspaceDB,
  hasWorkspaceUpdate?: (workspaceId: string) => boolean,
): boolean {
  if (workspace.boardScopedHomeOnly === true) {
    return false;
  }
  if (workspace.ownerId === userId) {
    return true;
  }
  if (hasWorkspaceUpdate !== undefined && hasWorkspaceUpdate(workspace.id)) {
    return true;
  }
  const roleKey = workspace.members.find((m) => m.userId === userId)?.roleKey;
  const rk =
    roleKey === 'member' ? 'viewer' : roleKey === undefined || roleKey === '' ? 'viewer' : roleKey;
  /** Match server: workspace managers can reorder home rows, so they may move boards between rows. */
  return rk === 'admin' || rk === 'manager';
}

export function canMoveBoardToTarget(
  userId: string,
  board: BoardDB,
  targetWorkspaceId: string,
  workspaces: WorkspaceDB[],
  options?: {
    hasBoardUpdate?: (boardId: string) => boolean;
    hasWorkspaceUpdate?: (workspaceId: string) => boolean;
  },
): boolean {
  const sourceKey = boardWorkspaceKey(board);
  const targetKey = targetWorkspaceId.trim();
  if (sourceKey === targetKey) {
    return false;
  }
  const hasBoardUpdate = options?.hasBoardUpdate;
  const canEditDraggedBoard =
    board.ownerId === userId ||
    (hasBoardUpdate !== undefined && hasBoardUpdate(board.id)) ||
    canUserEditBoard(userId, board);
  if (!canEditDraggedBoard) {
    return false;
  }

  const hasWs = options?.hasWorkspaceUpdate;
  const targetWs = workspaces.find((w) => w.id === targetKey);
  if (targetWs == null || !canManageWorkspaceForBoardMoves(userId, targetWs, hasWs)) {
    return false;
  }

  if (sourceKey !== '') {
    const sourceWs = workspaces.find((w) => w.id === sourceKey);
    if (sourceWs == null || !canManageWorkspaceForBoardMoves(userId, sourceWs, hasWs)) {
      return false;
    }
  }

  return true;
}

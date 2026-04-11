import { api } from '../../utils/api.js';
import { transformBoard } from '../../utils/transform.js';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import { canMoveBoardToTarget } from '../../components/home/homePageBoardMovePermissions.js';
import {
  boardIdKey,
  boardsAfterCrossWorkspaceAppend,
  getBoardsInWorkspaceSorted,
  mergeClientOrderWithServerScope,
  moveHomeBoardOptimistic,
} from './homeBoardLayout.js';

export async function fetchBoardsForWorkspaceReorder(workspaceId: string): Promise<BoardDB[]> {
  const boardsResponse = await api.getBoards({
    workspaceId,
    view: 'summary',
    cacheBust: true,
    fields: [
      'workspaceId',
      'position',
      'name',
      'description',
      'background',
      'visibility',
      'ownerId',
      'members',
      'createdAt',
      'updatedAt',
    ],
  });
  const raw = (boardsResponse as { boards: unknown[] }).boards;
  return raw.map((board) => transformBoard(board));
}

export interface HomeBoardMoveInput {
  readonly boards: BoardDB[];
  readonly workspaces: WorkspaceDB[];
  readonly userId: string | undefined;
  readonly activeBoardId: string;
  /** Workspace row where the drag started (never infer from optimistic `boards` — those already mutate `workspaceId`). */
  readonly sourceWorkspaceId: string;
  readonly targetWorkspaceId: string;
  /** `null` = insert at end of target workspace row (same or cross workspace). */
  readonly anchorBoardId: string | null;
  readonly hasBoardUpdate: (boardId: string) => boolean;
  readonly hasWorkspaceUpdate: (workspaceId: string) => boolean;
}

/**
 * Persist home board reorder or cross-workspace move. Server enforces permissions.
 */
export async function persistHomeBoardMove(input: HomeBoardMoveInput): Promise<void> {
  const {
    boards,
    workspaces,
    userId: uid,
    activeBoardId,
    sourceWorkspaceId,
    targetWorkspaceId,
    anchorBoardId,
    hasBoardUpdate,
    hasWorkspaceUpdate,
  } = input;

  if (uid == null || uid === '') {
    throw new Error('HOME_MOVE_SIGNED_OUT');
  }

  const sourceRowWs = sourceWorkspaceId.trim();
  if (sourceRowWs === '') {
    throw new Error('HOME_MOVE_MISSING_WORKSPACE');
  }

  const dragged = boards.find((b) => boardIdKey(b.id) === boardIdKey(activeBoardId));
  if (dragged == null) {
    throw new Error('HOME_MOVE_MISSING_BOARD');
  }

  const rowWs = targetWorkspaceId.trim();

  if (sourceRowWs === rowWs) {
    if (anchorBoardId != null && boardIdKey(anchorBoardId) === boardIdKey(activeBoardId)) {
      return;
    }
    const serverScope = await fetchBoardsForWorkspaceReorder(rowWs);
    let nextScope = moveHomeBoardOptimistic(serverScope, activeBoardId, rowWs, anchorBoardId);
    if (nextScope == null) {
      const normalized = boards.map((b) =>
        boardIdKey(b.id) === boardIdKey(activeBoardId) ? { ...b, workspaceId: rowWs } : b,
      );
      nextScope = moveHomeBoardOptimistic(normalized, activeBoardId, rowWs, anchorBoardId);
    }
    if (nextScope == null) {
      return;
    }
    const clientDesiredIds = getBoardsInWorkspaceSorted(nextScope, rowWs).map((b) => b.id);
    const freshScope = await fetchBoardsForWorkspaceReorder(rowWs);
    const finalIds = mergeClientOrderWithServerScope(rowWs, clientDesiredIds, freshScope);
    if (finalIds.length === 0) {
      return;
    }
    await api.reorderHomeBoards({
      workspaceId: rowWs,
      orderedBoardIds: finalIds,
    });
    return;
  }

  const draggedForPermission: BoardDB = { ...dragged, workspaceId: sourceRowWs };
  if (
    !canMoveBoardToTarget(uid, draggedForPermission, rowWs, workspaces, {
      hasBoardUpdate,
      hasWorkspaceUpdate,
    })
  ) {
    throw new Error('HOME_MOVE_FORBIDDEN');
  }

  const afterBoards =
    moveHomeBoardOptimistic(boards, activeBoardId, rowWs, anchorBoardId) ??
    boardsAfterCrossWorkspaceAppend(boards, activeBoardId, rowWs);

  await api.updateBoard(dragged.id, { workspaceId: rowWs });
  const [targetServerBoards, sourceServerBoards] = await Promise.all([
    fetchBoardsForWorkspaceReorder(rowWs),
    fetchBoardsForWorkspaceReorder(sourceRowWs),
  ]);
  const targetIds = mergeClientOrderWithServerScope(
    rowWs,
    getBoardsInWorkspaceSorted(afterBoards, rowWs).map((b) => b.id),
    targetServerBoards,
  );
  const sourceIds = mergeClientOrderWithServerScope(
    sourceRowWs,
    getBoardsInWorkspaceSorted(afterBoards, sourceRowWs).map((b) => b.id),
    sourceServerBoards,
  );
  if (targetIds.length > 0) {
    await api.reorderHomeBoards({ workspaceId: rowWs, orderedBoardIds: targetIds });
  }
  if (sourceIds.length > 0) {
    await api.reorderHomeBoards({ workspaceId: sourceRowWs, orderedBoardIds: sourceIds });
  }
}

export async function persistWorkspaceRowOrder(orderedWorkspaceIds: readonly string[]): Promise<string[]> {
  const res = await api.updateUserPreferences({ homeWorkspaceOrder: [...orderedWorkspaceIds] });
  const user = (res as { user?: { preferences?: { homeWorkspaceOrder?: string[] } } }).user;
  return user?.preferences?.homeWorkspaceOrder ?? [...orderedWorkspaceIds];
}

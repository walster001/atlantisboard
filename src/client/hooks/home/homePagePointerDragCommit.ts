import type { MutableRefObject } from 'react';
import type { BoardDB } from '../../store/database.js';
import {
  boardsAfterCrossWorkspaceAppend,
  dedupeBoardsLastWinsById,
  moveHomeBoardOptimistic,
  sortBoardsFlatHome,
} from '../homeBoard/homeBoardLayout.js';
import { persistHomeBoardMove, type HomeBoardMoveInput } from '../homeBoard/homeBoardMove.js';
import {
  findHomeBoardGridForWorkspace,
  pickHomeBoardInsertAnchor,
  pickHomeTargetWorkspaceIdUnderPointer,
  pickHomeWorkspaceRowInsertIndex,
} from './homePointerHitTest.js';
import type {
  BoardDropIndicator,
  HomePagePointerDragActions,
  HomePagePointerDragModels,
  Session,
} from './homePagePointerDragTypes.js';

export interface HomePagePointerDragCommitContext {
  readonly root: HTMLDivElement;
  readonly sessionRef: { readonly current: Session };
  readonly modelsRef: { readonly current: HomePagePointerDragModels };
  readonly actionsRef: { readonly current: HomePagePointerDragActions };
  readonly suppressBoardClickRef: { current: boolean };
  readonly boardDropIndicatorRef: MutableRefObject<BoardDropIndicator>;
  readonly workspaceRowDragRef: MutableRefObject<{
    readonly workspaceId: string | null;
    readonly insertIndex: number | null;
  }>;
  readonly disarm: () => void;
}

function resetSuppressBoardClick(ctx: HomePagePointerDragCommitContext): void {
  window.setTimeout(() => {
    ctx.suppressBoardClickRef.current = false;
  }, 0);
}

export async function commitHomeBoardDrag(
  ctx: HomePagePointerDragCommitContext,
  ev: Pick<PointerEvent, 'clientX' | 'clientY'>,
): Promise<void> {
  const s = ctx.sessionRef.current;
  if (s == null || s.kind !== 'active_board') {
    ctx.disarm();
    return;
  }
  const snapshot = {
    boardId: s.boardId,
    sourceWorkspaceId: s.sourceWorkspaceId,
    boardsBefore: s.boardsBefore,
  };
  const m = ctx.modelsRef.current;
  const acts = ctx.actionsRef.current;
  const indicator = ctx.boardDropIndicatorRef.current;
  const targetWs =
    indicator?.workspaceId ??
    pickHomeTargetWorkspaceIdUnderPointer(ev.clientX, ev.clientY);
  if (targetWs == null) {
    acts.setAllBoards(snapshot.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }
  const grid = findHomeBoardGridForWorkspace(ctx.root, targetWs);
  if (grid == null) {
    acts.setAllBoards(snapshot.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }
  const anchorBoardId =
    indicator != null && indicator.workspaceId === targetWs
      ? indicator.anchorBoardId
      : pickHomeBoardInsertAnchor(grid, ev.clientX, ev.clientY, snapshot.boardId).anchorBoardId;

  const sameWs = snapshot.sourceWorkspaceId === targetWs;

  let applied: BoardDB[] | null = moveHomeBoardOptimistic(
    m.boards,
    snapshot.boardId,
    targetWs,
    anchorBoardId,
    m.homeBoardOrderByWorkspace,
  );
  if (applied == null && !sameWs) {
    applied = boardsAfterCrossWorkspaceAppend(m.boards, snapshot.boardId, targetWs);
  }
  if (applied == null) {
    acts.setAllBoards(snapshot.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }

  acts.setAllBoards(sortBoardsFlatHome(dedupeBoardsLastWinsById(applied)));

  const input: HomeBoardMoveInput = {
    boards: applied,
    workspaces: [...m.workspaces],
    userId: m.userId,
    activeBoardId: snapshot.boardId,
    sourceWorkspaceId: snapshot.sourceWorkspaceId,
    targetWorkspaceId: targetWs,
    anchorBoardId,
    hasBoardUpdate: acts.hasBoardUpdate,
    hasWorkspaceUpdate: acts.hasWorkspaceUpdate,
    homeBoardOrderByWorkspace: m.homeBoardOrderByWorkspace,
  };

  /* Release float preview and drag chrome before network I/O (persist can be slow in prod). */
  ctx.disarm();
  resetSuppressBoardClick(ctx);

  try {
    await persistHomeBoardMove(input);
    await acts.refreshUserAfterBoardMove();
  } catch (err) {
    console.error(err);
    acts.setAllBoards(snapshot.boardsBefore);
    const msg =
      err instanceof Error && err.message === 'HOME_MOVE_FORBIDDEN'
        ? 'You cannot move this board there.'
        : err instanceof Error &&
            (err.message === 'HOME_MOVE_MISSING_BOARD' ||
              err.message === 'HOME_MOVE_MISSING_WORKSPACE')
          ? 'Could not save board move. Try refreshing the page.'
          : 'Failed to move board.';
    acts.onMoveError(msg);
  }
}

export async function commitHomeWorkspaceDrag(
  ctx: HomePagePointerDragCommitContext,
  ev: Pick<PointerEvent, 'clientX' | 'clientY'>,
): Promise<void> {
  const s = ctx.sessionRef.current;
  if (s == null || s.kind !== 'active_workspace') {
    ctx.disarm();
    return;
  }
  const rowDrag = ctx.workspaceRowDragRef.current;
  const insert =
    rowDrag.workspaceId === s.workspaceId && rowDrag.insertIndex != null
      ? rowDrag.insertIndex
      : pickHomeWorkspaceRowInsertIndex(ctx.root, ev.clientY, s.workspaceId);
  const ids = [...s.orderedIdsBefore];
  const without = ids.filter((id) => id !== s.workspaceId);
  const next = [...without.slice(0, insert), s.workspaceId, ...without.slice(insert)];
  const same = next.length === ids.length && next.every((id, i) => id === ids[i]);
  if (same) {
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }

  ctx.disarm();
  resetSuppressBoardClick(ctx);

  try {
    await ctx.actionsRef.current.persistWorkspaceOrder(next);
  } catch (err) {
    console.error(err);
    ctx.actionsRef.current.onMoveError('Failed to save workspace order.');
  }
}

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
  const m = ctx.modelsRef.current;
  const acts = ctx.actionsRef.current;
  const targetWs = pickHomeTargetWorkspaceIdUnderPointer(ev.clientX, ev.clientY);
  if (targetWs == null) {
    acts.setAllBoards(s.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }
  const grid = findHomeBoardGridForWorkspace(ctx.root, targetWs);
  if (grid == null) {
    acts.setAllBoards(s.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }
  const { anchorBoardId } = pickHomeBoardInsertAnchor(grid, ev.clientX, ev.clientY, s.boardId);

  const sameWs = s.sourceWorkspaceId === targetWs;

  let applied: BoardDB[] | null = moveHomeBoardOptimistic(m.boards, s.boardId, targetWs, anchorBoardId);
  if (applied == null && !sameWs) {
    applied = boardsAfterCrossWorkspaceAppend(m.boards, s.boardId, targetWs);
  }
  if (applied == null) {
    acts.setAllBoards(s.boardsBefore);
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }

  acts.setAllBoards(sortBoardsFlatHome(dedupeBoardsLastWinsById(applied)));

  const input: HomeBoardMoveInput = {
    boards: applied,
    workspaces: [...m.workspaces],
    userId: m.userId,
    activeBoardId: s.boardId,
    sourceWorkspaceId: s.sourceWorkspaceId,
    targetWorkspaceId: targetWs,
    anchorBoardId,
    hasBoardUpdate: acts.hasBoardUpdate,
    hasWorkspaceUpdate: acts.hasWorkspaceUpdate,
  };

  try {
    await persistHomeBoardMove(input);
    await acts.refreshUserAfterBoardMove();
  } catch (err) {
    console.error(err);
    acts.setAllBoards(s.boardsBefore);
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

  ctx.disarm();
  resetSuppressBoardClick(ctx);
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
  const insert = pickHomeWorkspaceRowInsertIndex(ctx.root, ev.clientY, s.workspaceId);
  const ids = [...s.orderedIdsBefore];
  const without = ids.filter((id) => id !== s.workspaceId);
  const next = [...without.slice(0, insert), s.workspaceId, ...without.slice(insert)];
  const same = next.length === ids.length && next.every((id, i) => id === ids[i]);
  if (same) {
    ctx.disarm();
    resetSuppressBoardClick(ctx);
    return;
  }
  try {
    await ctx.actionsRef.current.persistWorkspaceOrder(next);
  } catch (err) {
    console.error(err);
    ctx.actionsRef.current.onMoveError('Failed to save workspace order.');
  }
  ctx.disarm();
  resetSuppressBoardClick(ctx);
}

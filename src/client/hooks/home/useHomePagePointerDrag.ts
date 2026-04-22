import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';
import {
  boardIdKey,
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

const HOME_DRAG_DEADZONE_PX = 6;

type FloatState =
  | { readonly kind: 'board'; readonly name: string }
  | { readonly kind: 'workspace'; readonly name: string }
  | null;

type PendingBoard = {
  readonly kind: 'pending_board';
  readonly boardId: string;
  readonly workspaceId: string;
  readonly handleEl: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
};

type ActiveBoard = {
  readonly kind: 'active_board';
  readonly boardId: string;
  readonly sourceWorkspaceId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement;
  readonly initialX: number;
  readonly initialY: number;
  readonly boardsBefore: BoardDB[];
};

type PendingWorkspace = {
  readonly kind: 'pending_workspace';
  readonly workspaceId: string;
  readonly handleEl: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
};

type ActiveWorkspace = {
  readonly kind: 'active_workspace';
  readonly workspaceId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement;
  readonly initialX: number;
  readonly initialY: number;
  readonly orderedIdsBefore: string[];
};

type Session = PendingBoard | ActiveBoard | PendingWorkspace | ActiveWorkspace | null;

function dragDistanceExceedsDeadzone(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  minPx: number = HOME_DRAG_DEADZONE_PX,
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= minPx;
}

export interface HomePagePointerDragRefs {
  readonly listRootRef: RefObject<HTMLDivElement | null>;
  readonly floatHostRef: RefObject<HTMLDivElement | null>;
  readonly previewPositionRef: MutableRefObject<{ x: number; y: number }>;
  readonly previewMetricsRef: MutableRefObject<{ width: number; height: number }>;
}

export interface HomePagePointerDragModels {
  readonly boards: BoardDB[];
  readonly orderedWorkspaceIds: readonly string[];
  readonly workspaces: readonly WorkspaceDB[];
  readonly userId: string | undefined;
}

export interface HomePagePointerDragActions {
  readonly setAllBoards: React.Dispatch<React.SetStateAction<BoardDB[]>>;
  readonly setWorkspaceRowDrag: (next: { readonly workspaceId: string | null; readonly insertIndex: number | null }) => void;
  /** Workspace id whose board grid shows cross-workspace drop styling; `null` when not over a foreign row/grid. */
  readonly setBoardGridDropTarget: (workspaceId: string | null) => void;
  readonly setHomeDraggingClass: (on: boolean) => void;
  readonly canDragBoard: (board: BoardDB) => boolean;
  readonly canReorderAllBoardsInWorkspace: (workspaceId: string) => boolean;
  readonly hasBoardUpdate: (boardId: string) => boolean;
  readonly hasWorkspaceUpdate: (workspaceId: string) => boolean;
  readonly persistWorkspaceOrder: (orderedIds: string[]) => Promise<void>;
  readonly onMoveError: (message: string) => void;
}

/**
 * Delegated home-page pointer drag (boards + workspace rows). Mirrors Kanban pointer capture + rAF pattern.
 */
export function useHomePagePointerDrag(
  refs: HomePagePointerDragRefs,
  modelsRef: MutableRefObject<HomePagePointerDragModels>,
  actionsRef: MutableRefObject<HomePagePointerDragActions>,
  /** When false, listeners are not attached (e.g. home list not mounted yet). */
  layoutReady: boolean,
): {
  readonly suppressBoardClickRef: MutableRefObject<boolean>;
  readonly floatPreview: FloatState;
  readonly draggingBoardId: string | null;
} {
  const sessionRef = useRef<Session>(null);
  const rafRef = useRef<number | null>(null);
  const commitRafRef = useRef<number | null>(null);
  const [floatPreview, setFloatPreview] = useState<FloatState>(null);
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const suppressBoardClickRef = useRef(false);

  const refsR = useRef(refs);
  refsR.current = refs;

  useEffect(() => {
    if (!layoutReady) {
      return undefined;
    }
    const root = refsR.current.listRootRef.current;
    if (root == null) {
      return undefined;
    }

    const cancelRaf = (): void => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (commitRafRef.current != null) {
        cancelAnimationFrame(commitRafRef.current);
        commitRafRef.current = null;
      }
    };

    const positionFloat = (clientX: number, clientY: number): void => {
      const { previewPositionRef, previewMetricsRef, floatHostRef } = refsR.current;
      previewPositionRef.current = { x: clientX, y: clientY };
      const host = floatHostRef.current;
      if (host != null) {
        const { width, height } = previewMetricsRef.current;
        host.style.transform = `translate3d(${Math.round(clientX - width / 2)}px, ${Math.round(clientY - height / 2)}px, 0)`;
      }
    };

    const disarm = (): void => {
      cancelRaf();
      const s = sessionRef.current;
      sessionRef.current = null;
      if (s != null && (s.kind === 'active_board' || s.kind === 'active_workspace')) {
        try {
          s.captureTarget.releasePointerCapture(s.pointerId);
        } catch {
          // ignore
        }
      }
      setFloatPreview(null);
      actionsRef.current.setWorkspaceRowDrag({ workspaceId: null, insertIndex: null });
      actionsRef.current.setBoardGridDropTarget(null);
      setDraggingBoardId(null);
      actionsRef.current.setHomeDraggingClass(false);
    };

    const onWindowPointerMove = (ev: PointerEvent): void => {
      const s = sessionRef.current;
      if (s == null) {
        return;
      }

      if (s.kind === 'pending_board') {
        if (!dragDistanceExceedsDeadzone(s.startX, s.startY, ev.clientX, ev.clientY)) {
          return;
        }
        const m = modelsRef.current;
        const board = m.boards.find((b) => boardIdKey(b.id) === boardIdKey(s.boardId));
        if (board == null || !actionsRef.current.canDragBoard(board)) {
          disarm();
          return;
        }
        const captureTarget = s.handleEl;
        try {
          captureTarget.setPointerCapture(ev.pointerId);
        } catch {
          disarm();
          return;
        }
        const tile = root.querySelector<HTMLElement>(`[data-home-board-id="${CSS.escape(s.boardId)}"]`);
        if (tile != null) {
          const r = tile.getBoundingClientRect();
          refsR.current.previewMetricsRef.current = { width: r.width, height: r.height };
        } else {
          refsR.current.previewMetricsRef.current = { width: 220, height: 120 };
        }
        sessionRef.current = {
          kind: 'active_board',
          boardId: s.boardId,
          sourceWorkspaceId: s.workspaceId,
          pointerId: ev.pointerId,
          captureTarget,
          initialX: s.startX,
          initialY: s.startY,
          boardsBefore: m.boards,
        };
        setFloatPreview({ kind: 'board', name: board.name });
        setDraggingBoardId(s.boardId);
        actionsRef.current.setHomeDraggingClass(true);
        suppressBoardClickRef.current = true;
      }

      if (s.kind === 'pending_workspace') {
        if (!dragDistanceExceedsDeadzone(s.startX, s.startY, ev.clientX, ev.clientY)) {
          return;
        }
        const m = modelsRef.current;
        const ws = m.workspaces.find((w) => w.id === s.workspaceId);
        if (ws == null) {
          disarm();
          return;
        }
        const captureTarget = s.handleEl;
        try {
          captureTarget.setPointerCapture(ev.pointerId);
        } catch {
          disarm();
          return;
        }
        refsR.current.previewMetricsRef.current = { width: 200, height: 44 };
        sessionRef.current = {
          kind: 'active_workspace',
          workspaceId: s.workspaceId,
          pointerId: ev.pointerId,
          captureTarget,
          initialX: s.startX,
          initialY: s.startY,
          orderedIdsBefore: [...m.orderedWorkspaceIds],
        };
        setFloatPreview({ kind: 'workspace', name: ws.name });
        actionsRef.current.setWorkspaceRowDrag({ workspaceId: s.workspaceId, insertIndex: null });
        actionsRef.current.setHomeDraggingClass(true);
        suppressBoardClickRef.current = true;
      }

      const cur = sessionRef.current;
      if (cur == null) {
        return;
      }

      if (rafRef.current != null) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const live = sessionRef.current;
        if (live == null) {
          return;
        }
        positionFloat(ev.clientX, ev.clientY);

        if (live.kind === 'active_board') {
          const targetWs = pickHomeTargetWorkspaceIdUnderPointer(ev.clientX, ev.clientY);
          if (targetWs != null && targetWs !== live.sourceWorkspaceId) {
            actionsRef.current.setBoardGridDropTarget(targetWs);
          } else {
            actionsRef.current.setBoardGridDropTarget(null);
          }
        }

        if (live.kind === 'active_workspace') {
          const idx = pickHomeWorkspaceRowInsertIndex(root, ev.clientY, live.workspaceId);
          actionsRef.current.setWorkspaceRowDrag({ workspaceId: live.workspaceId, insertIndex: idx });
        }
      });
    };

    const commitBoardDrag = async (ev: Pick<PointerEvent, 'clientX' | 'clientY'>): Promise<void> => {
      const s = sessionRef.current;
      if (s == null || s.kind !== 'active_board') {
        disarm();
        return;
      }
      const m = modelsRef.current;
      const acts = actionsRef.current;
      const targetWs = pickHomeTargetWorkspaceIdUnderPointer(ev.clientX, ev.clientY);
      if (targetWs == null) {
        acts.setAllBoards(s.boardsBefore);
        disarm();
        window.setTimeout(() => {
          suppressBoardClickRef.current = false;
        }, 0);
        return;
      }
      const grid = findHomeBoardGridForWorkspace(root, targetWs);
      if (grid == null) {
        acts.setAllBoards(s.boardsBefore);
        disarm();
        window.setTimeout(() => {
          suppressBoardClickRef.current = false;
        }, 0);
        return;
      }
      const { anchorBoardId } = pickHomeBoardInsertAnchor(grid, ev.clientX, ev.clientY, s.boardId);

      const sameWs = s.sourceWorkspaceId === targetWs;
      if (sameWs && !acts.canReorderAllBoardsInWorkspace(targetWs)) {
        acts.setAllBoards(s.boardsBefore);
        disarm();
        acts.onMoveError('You cannot reorder boards in this workspace.');
        window.setTimeout(() => {
          suppressBoardClickRef.current = false;
        }, 0);
        return;
      }

      let applied: BoardDB[] | null = moveHomeBoardOptimistic(m.boards, s.boardId, targetWs, anchorBoardId);
      if (applied == null && !sameWs) {
        applied = boardsAfterCrossWorkspaceAppend(m.boards, s.boardId, targetWs);
      }
      if (applied == null) {
        acts.setAllBoards(s.boardsBefore);
        disarm();
        window.setTimeout(() => {
          suppressBoardClickRef.current = false;
        }, 0);
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

      disarm();
      window.setTimeout(() => {
        suppressBoardClickRef.current = false;
      }, 0);
    };

    const commitWorkspaceDrag = async (ev: Pick<PointerEvent, 'clientX' | 'clientY'>): Promise<void> => {
      const s = sessionRef.current;
      if (s == null || s.kind !== 'active_workspace') {
        disarm();
        return;
      }
      const insert = pickHomeWorkspaceRowInsertIndex(root, ev.clientY, s.workspaceId);
      const ids = [...s.orderedIdsBefore];
      const without = ids.filter((id) => id !== s.workspaceId);
      const next = [...without.slice(0, insert), s.workspaceId, ...without.slice(insert)];
      const same = next.length === ids.length && next.every((id, i) => id === ids[i]);
      if (same) {
        disarm();
        window.setTimeout(() => {
          suppressBoardClickRef.current = false;
        }, 0);
        return;
      }
      try {
        await actionsRef.current.persistWorkspaceOrder(next);
      } catch (err) {
        console.error(err);
        actionsRef.current.onMoveError('Failed to save workspace order.');
      }
      disarm();
      window.setTimeout(() => {
        suppressBoardClickRef.current = false;
      }, 0);
    };

    const onWindowPointerUp = (ev: PointerEvent): void => {
      const s = sessionRef.current;
      if (s == null) {
        return;
      }
      if (s.kind === 'pending_board' || s.kind === 'pending_workspace') {
        disarm();
        return;
      }
      if (s.kind === 'active_board' && s.pointerId === ev.pointerId) {
        const evSnapshot = { clientX: ev.clientX, clientY: ev.clientY } satisfies Pick<
          PointerEvent,
          'clientX' | 'clientY'
        >;
        commitRafRef.current = requestAnimationFrame(() => {
          commitRafRef.current = null;
          void commitBoardDrag(evSnapshot);
        });
        return;
      }
      if (s.kind === 'active_workspace' && s.pointerId === ev.pointerId) {
        const evSnapshot = { clientX: ev.clientX, clientY: ev.clientY } satisfies Pick<
          PointerEvent,
          'clientX' | 'clientY'
        >;
        commitRafRef.current = requestAnimationFrame(() => {
          commitRafRef.current = null;
          void commitWorkspaceDrag(evSnapshot);
        });
      }
    };

    const onPointerDownCapture = (ev: PointerEvent): void => {
      if (ev.button !== 0 || sessionRef.current != null) {
        return;
      }
      const t = ev.target;
      if (!(t instanceof Element)) {
        return;
      }
      if (t.closest('[data-home-board-no-drag="1"]') != null) {
        return;
      }
      const wsHandle = t.closest('[data-home-workspace-drag-handle]');
      if (wsHandle instanceof HTMLElement) {
        const wsId = wsHandle.getAttribute('data-home-workspace-id');
        if (typeof wsId === 'string' && wsId !== '') {
          ev.preventDefault();
          sessionRef.current = {
            kind: 'pending_workspace',
            workspaceId: wsId,
            handleEl: wsHandle,
            startX: ev.clientX,
            startY: ev.clientY,
            pointerId: ev.pointerId,
          };
          window.addEventListener('pointermove', onWindowPointerMove);
          window.addEventListener('pointerup', onWindowPointerUp);
          window.addEventListener('pointercancel', onWindowPointerUp);
        }
        return;
      }
      const boardTile = t.closest('[data-home-board-draggable="1"]');
      if (boardTile instanceof HTMLElement) {
        const boardId = boardTile.getAttribute('data-home-board-id');
        const wsId = boardTile.getAttribute('data-home-workspace-id');
        if (typeof boardId === 'string' && boardId !== '' && typeof wsId === 'string' && wsId !== '') {
          ev.preventDefault();
          sessionRef.current = {
            kind: 'pending_board',
            boardId,
            workspaceId: wsId,
            handleEl: boardTile,
            startX: ev.clientX,
            startY: ev.clientY,
            pointerId: ev.pointerId,
          };
          window.addEventListener('pointermove', onWindowPointerMove);
          window.addEventListener('pointerup', onWindowPointerUp);
          window.addEventListener('pointercancel', onWindowPointerUp);
        }
      }
    };

    root.addEventListener('pointerdown', onPointerDownCapture, true);

    return () => {
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      cancelRaf();
      sessionRef.current = null;
    };
  }, [layoutReady, refs.listRootRef]);

  return { suppressBoardClickRef, floatPreview, draggingBoardId };
}

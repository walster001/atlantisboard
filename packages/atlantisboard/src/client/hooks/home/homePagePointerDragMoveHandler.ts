import type { MutableRefObject } from 'react';
import { boardIdKey } from '../homeBoard/homeBoardLayout.js';
import {
  findHomeBoardGridForWorkspace,
  pickHomeBoardInsertAnchor,
  pickHomeTargetWorkspaceIdUnderPointer,
  pickHomeWorkspaceRowInsertIndex,
} from './homePointerHitTest.js';
import {
  dragDistanceExceedsDeadzone,
  HOME_MOBILE_BOARD_LONG_PRESS_CANCEL_PX,
  type BoardDropIndicator,
  type FloatState,
  type HomePagePointerDragActions,
  type HomePagePointerDragModels,
  type HomePagePointerDragRefs,
  type Session,
} from './homePagePointerDragTypes.js';

export interface HomePagePointerMoveHandlerContext {
  readonly root: HTMLDivElement;
  readonly sessionRef: MutableRefObject<Session>;
  readonly rafRef: MutableRefObject<number | null>;
  readonly refsR: MutableRefObject<HomePagePointerDragRefs>;
  readonly modelsRef: MutableRefObject<HomePagePointerDragModels>;
  readonly actionsRef: MutableRefObject<HomePagePointerDragActions>;
  readonly touchReorderRequiresLongPressRef: MutableRefObject<boolean>;
  readonly suppressBoardClickRef: MutableRefObject<boolean>;
  readonly setFloatPreview: (next: FloatState) => void;
  readonly setDraggingBoardId: (next: string | null) => void;
  readonly setBoardDropIndicator: (next: BoardDropIndicator) => void;
  readonly disarm: () => void;
  readonly positionFloat: (clientX: number, clientY: number) => void;
  readonly clearDocumentSelection: () => void;
}

export function createHomePagePointerMoveHandler(
  ctx: HomePagePointerMoveHandlerContext,
): (ev: PointerEvent) => void {
  const {
    root,
    sessionRef,
    rafRef,
    refsR,
    modelsRef,
    actionsRef,
    touchReorderRequiresLongPressRef,
    suppressBoardClickRef,
    setFloatPreview,
    setDraggingBoardId,
    setBoardDropIndicator,
    disarm,
    positionFloat,
    clearDocumentSelection,
  } = ctx;

  return (ev: PointerEvent): void => {
    const s = sessionRef.current;
    if (s == null) {
      return;
    }

    if (s.kind === 'pending_board') {
      if (!s.reorderArmed) {
        clearDocumentSelection();
        if (
          dragDistanceExceedsDeadzone(
            s.startX,
            s.startY,
            ev.clientX,
            ev.clientY,
            HOME_MOBILE_BOARD_LONG_PRESS_CANCEL_PX,
          )
        ) {
          disarm();
        }
        return;
      }
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
      const isTouchPointer = ev.pointerType === 'touch' || ev.pointerType === 'pen';
      if (!isTouchPointer) {
        try {
          captureTarget.setPointerCapture(ev.pointerId);
        } catch {
          disarm();
          return;
        }
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
        captureTarget: isTouchPointer ? null : captureTarget,
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
      const isTouchPointer = ev.pointerType === 'touch' || ev.pointerType === 'pen';
      if (!isTouchPointer) {
        try {
          captureTarget.setPointerCapture(ev.pointerId);
        } catch {
          disarm();
          return;
        }
      }
      refsR.current.previewMetricsRef.current = { width: 200, height: 44 };
      sessionRef.current = {
        kind: 'active_workspace',
        workspaceId: s.workspaceId,
        pointerId: ev.pointerId,
        captureTarget: isTouchPointer ? null : captureTarget,
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

      if (live.kind === 'active_board') {
        const targetWs = pickHomeTargetWorkspaceIdUnderPointer(ev.clientX, ev.clientY);
        if (targetWs != null && targetWs !== live.sourceWorkspaceId) {
          actionsRef.current.setBoardGridDropTarget(targetWs);
        } else {
          actionsRef.current.setBoardGridDropTarget(null);
        }
        if (touchReorderRequiresLongPressRef.current && targetWs != null) {
          const grid = findHomeBoardGridForWorkspace(root, targetWs);
          if (grid != null) {
            const { anchorBoardId } = pickHomeBoardInsertAnchor(grid, ev.clientX, ev.clientY, live.boardId);
            setBoardDropIndicator({ workspaceId: targetWs, anchorBoardId });
          } else {
            setBoardDropIndicator(null);
          }
        } else if (touchReorderRequiresLongPressRef.current) {
          setBoardDropIndicator(null);
        }
      }

      if (live.kind === 'active_workspace') {
        const idx = pickHomeWorkspaceRowInsertIndex(root, ev.clientY, live.workspaceId);
        actionsRef.current.setWorkspaceRowDrag({ workspaceId: live.workspaceId, insertIndex: idx });
      }

      /**
       * Keep style writes after all geometry reads/hit-tests in this frame.
       * This reduces read-after-write pressure that can trigger forced sync layout.
       */
      positionFloat(ev.clientX, ev.clientY);
    });
  };
}

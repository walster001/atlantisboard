import type { MutableRefObject } from 'react';
import { boardIdKey } from '../homeBoard/homeBoardLayout.js';
import {
  findHomeBoardGridForWorkspace,
  pickHomeBoardInsertAnchor,
  pickHomeTargetWorkspaceIdUnderPointer,
  pickHomeWorkspaceRowInsertIndex,
} from './homePointerHitTest.js';
import { commitHomeBoardDrag, commitHomeWorkspaceDrag, type HomePagePointerDragCommitContext } from './homePagePointerDragCommit.js';
import {
  dragDistanceExceedsDeadzone,
  HOME_MOBILE_BOARD_LONG_PRESS_CANCEL_PX,
  HOME_MOBILE_BOARD_REORDER_LONG_PRESS_MS,
  isBoardDragSurface,
  type BoardDropIndicator,
  type FloatState,
  type HomeBoardLongPressUi,
  type HomePagePointerDragActions,
  type HomePagePointerDragModels,
  type HomePagePointerDragRefs,
  type Session,
} from './homePagePointerDragTypes.js';

export interface AttachHomePagePointerDragListenersArgs {
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
  readonly setBoardLongPressUi: (next: HomeBoardLongPressUi | null) => void;
  readonly setBoardDropIndicator: (next: BoardDropIndicator) => void;
}

export function attachHomePagePointerDragListeners(args: AttachHomePagePointerDragListenersArgs): () => void {
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
    setBoardLongPressUi,
    setBoardDropIndicator,
  } = args;

  const cancelRaf = (): void => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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

  const clearDocumentSelection = (): void => {
    const sel = window.getSelection();
    if (sel != null && !sel.isCollapsed) {
      sel.removeAllRanges();
    }
  };

  const disarm = (): void => {
    cancelRaf();
    const s = sessionRef.current;
    if (s?.kind === 'pending_board' && s.armTimerId != null) {
      window.clearTimeout(s.armTimerId);
    }
    sessionRef.current = null;
    if (s != null && (s.kind === 'active_board' || s.kind === 'active_workspace') && s.captureTarget != null) {
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
    setBoardLongPressUi(null);
    setBoardDropIndicator(null);
    actionsRef.current.setHomeDraggingClass(false);
  };

  const commitCtx: HomePagePointerDragCommitContext = {
    root,
    sessionRef,
    modelsRef,
    actionsRef,
    suppressBoardClickRef,
    disarm,
  };

  const onWindowPointerMove = (ev: PointerEvent): void => {
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

  const onWindowPointerCancel = (ev: PointerEvent): void => {
    const s = sessionRef.current;
    if (s == null) {
      return;
    }
    if (
      (s.kind === 'active_board' || s.kind === 'pending_board') &&
      s.pointerId === ev.pointerId
    ) {
      if (s.kind === 'active_board') {
        actionsRef.current.setAllBoards(s.boardsBefore);
      }
      disarm();
      window.setTimeout(() => {
        suppressBoardClickRef.current = false;
      }, 0);
      return;
    }
    if (
      (s.kind === 'active_workspace' || s.kind === 'pending_workspace') &&
      s.pointerId === ev.pointerId
    ) {
      disarm();
      window.setTimeout(() => {
        suppressBoardClickRef.current = false;
      }, 0);
    }
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
      void commitHomeBoardDrag(commitCtx, { clientX: ev.clientX, clientY: ev.clientY });
      return;
    }
    if (s.kind === 'active_workspace' && s.pointerId === ev.pointerId) {
      void commitHomeWorkspaceDrag(commitCtx, { clientX: ev.clientX, clientY: ev.clientY });
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
        window.addEventListener('pointercancel', onWindowPointerCancel);
      }
      return;
    }
    const boardTile = t.closest('[data-home-board-draggable="1"]');
    if (boardTile instanceof HTMLElement) {
      const boardId = boardTile.getAttribute('data-home-board-id');
      const wsId = boardTile.getAttribute('data-home-workspace-id');
      if (typeof boardId === 'string' && boardId !== '' && typeof wsId === 'string' && wsId !== '') {
        const touchLike = ev.pointerType === 'touch' || ev.pointerType === 'pen';
        const needsLongPress = touchReorderRequiresLongPressRef.current && touchLike;
        /* iOS: avoid preventDefault on touch pointerdown so long-press + scroll still work. */
        if (!needsLongPress) {
          ev.preventDefault();
        }
        const pointerIdCapture = ev.pointerId;
        let armTimerId: number | null = null;
        let reorderArmed = true;
        if (needsLongPress) {
          reorderArmed = false;
          armTimerId = window.setTimeout(() => {
            const cur = sessionRef.current;
            if (cur == null || cur.kind !== 'pending_board') {
              return;
            }
            if (cur.pointerId !== pointerIdCapture || cur.boardId !== boardId) {
              return;
            }
            if (cur.reorderArmed) {
              return;
            }
            sessionRef.current = {
              ...cur,
              reorderArmed: true,
              armTimerId: null,
            };
            clearDocumentSelection();
            setBoardLongPressUi({ boardId, phase: 'armed' });
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(12);
            }
          }, HOME_MOBILE_BOARD_REORDER_LONG_PRESS_MS);
        }
        if (needsLongPress) {
          clearDocumentSelection();
          setBoardLongPressUi({ boardId, phase: 'arming' });
        }
        sessionRef.current = {
          kind: 'pending_board',
          boardId,
          workspaceId: wsId,
          handleEl: boardTile,
          startX: ev.clientX,
          startY: ev.clientY,
          pointerId: ev.pointerId,
          reorderArmed,
          armTimerId,
        };
        window.addEventListener('pointermove', onWindowPointerMove);
        window.addEventListener('pointerup', onWindowPointerUp);
        window.addEventListener('pointercancel', onWindowPointerCancel);
      }
    }
  };

  /** iOS Safari: CSS user-select alone does not block long-press text selection. */
  const onSelectStartCapture = (ev: Event): void => {
    if (isBoardDragSurface(ev.target)) {
      ev.preventDefault();
      clearDocumentSelection();
    }
  };

  const onContextMenuCapture = (ev: Event): void => {
    if (isBoardDragSurface(ev.target)) {
      ev.preventDefault();
    }
  };

  /** While dragging, stop the page from scrolling under the finger (iOS). */
  const onTouchMoveCapture = (ev: TouchEvent): void => {
    const s = sessionRef.current;
    if (s == null) {
      return;
    }
    if (s.kind === 'active_board' || (s.kind === 'pending_board' && s.reorderArmed)) {
      if (ev.cancelable) {
        ev.preventDefault();
      }
    }
  };

  root.addEventListener('pointerdown', onPointerDownCapture, true);
  root.addEventListener('selectstart', onSelectStartCapture, true);
  root.addEventListener('contextmenu', onContextMenuCapture, true);
  root.addEventListener('touchmove', onTouchMoveCapture, { capture: true, passive: false });

  return () => {
    root.removeEventListener('pointerdown', onPointerDownCapture, true);
    root.removeEventListener('selectstart', onSelectStartCapture, true);
    root.removeEventListener('contextmenu', onContextMenuCapture, true);
    root.removeEventListener('touchmove', onTouchMoveCapture, true);
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerCancel);
    cancelRaf();
    sessionRef.current = null;
  };
}

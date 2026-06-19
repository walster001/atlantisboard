import type { MutableRefObject } from 'react';
import { commitHomeBoardDrag, commitHomeWorkspaceDrag, type HomePagePointerDragCommitContext } from './homePagePointerDragCommit.js';
import { createHomePagePointerDownCaptureHandler } from './homePagePointerDragDownHandler.js';
import { createHomePagePointerMoveHandler } from './homePagePointerDragMoveHandler.js';
import {
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
  readonly boardDropIndicatorRef: MutableRefObject<BoardDropIndicator>;
  readonly workspaceRowDragRef: MutableRefObject<{
    readonly workspaceId: string | null;
    readonly insertIndex: number | null;
  }>;
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
    boardDropIndicatorRef,
    workspaceRowDragRef,
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
    boardDropIndicatorRef,
    workspaceRowDragRef,
    disarm,
  };

  const onWindowPointerMove = createHomePagePointerMoveHandler({
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
  });

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

  const onPointerDownCapture = createHomePagePointerDownCaptureHandler({
    sessionRef,
    touchReorderRequiresLongPressRef,
    setBoardLongPressUi,
    clearDocumentSelection,
    onWindowPointerMove,
    onWindowPointerUp,
    onWindowPointerCancel,
  });

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

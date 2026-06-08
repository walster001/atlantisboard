import type { MutableRefObject } from 'react';
import {
  HOME_MOBILE_BOARD_REORDER_LONG_PRESS_MS,
  type HomeBoardLongPressUi,
  type Session,
} from './homePagePointerDragTypes.js';

export interface HomePagePointerDownHandlerContext {
  readonly sessionRef: MutableRefObject<Session>;
  readonly touchReorderRequiresLongPressRef: MutableRefObject<boolean>;
  readonly setBoardLongPressUi: (next: HomeBoardLongPressUi | null) => void;
  readonly clearDocumentSelection: () => void;
  readonly onWindowPointerMove: (ev: PointerEvent) => void;
  readonly onWindowPointerUp: (ev: PointerEvent) => void;
  readonly onWindowPointerCancel: (ev: PointerEvent) => void;
}

export function createHomePagePointerDownCaptureHandler(
  ctx: HomePagePointerDownHandlerContext,
): (ev: PointerEvent) => void {
  const {
    sessionRef,
    touchReorderRequiresLongPressRef,
    setBoardLongPressUi,
    clearDocumentSelection,
    onWindowPointerMove,
    onWindowPointerUp,
    onWindowPointerCancel,
  } = ctx;

  return (ev: PointerEvent): void => {
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
}

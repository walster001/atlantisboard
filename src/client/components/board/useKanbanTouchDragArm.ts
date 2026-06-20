import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { ElementGetFeedbackArgs } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { kanbanNativeCardDragActiveRef } from './kanbanMobileDragState.js';

interface TouchStartPoint {
  readonly x: number;
  readonly y: number;
}

export interface UseKanbanTouchDragArmOptions {
  /** When true (e.g. mobile Embla carousel), `canDragForNative` stays false until long-press arms. */
  readonly requireTouchArmForNativeDrag?: boolean;
  /** Long-press duration before arming (ms). */
  readonly longPressMs?: number;
  /** Cancel arming if pointer moves beyond this slop from pointerdown (px). */
  readonly cancelMoveSlopPx?: number;
}

export interface UseKanbanTouchDragArmResult {
  readonly touchArmedForDrag: boolean;
  readonly clearLongPressState: () => void;
  readonly canDragForNative: (args: ElementGetFeedbackArgs) => boolean;
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
}

function isTouchLikePointer(event: PointerEvent<HTMLDivElement>): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

export function useKanbanTouchDragArm(
  kanbanCardBodyDraggable: boolean,
  options?: UseKanbanTouchDragArmOptions,
): UseKanbanTouchDragArmResult {
  const requireArm = options?.requireTouchArmForNativeDrag === true;
  const longPressMs = options?.longPressMs ?? 280;
  const cancelMoveSlopPx = options?.cancelMoveSlopPx ?? 10;

  const requireArmRef = useRef(requireArm);
  const touchArmedRef = useRef(false);
  const [touchArmedForDrag, setTouchArmedForDrag] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<TouchStartPoint | null>(null);

  useLayoutEffect(() => {
    requireArmRef.current = requireArm;
  }, [requireArm]);

  const clearLongPressState = useCallback((): void => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
    touchArmedRef.current = false;
    setTouchArmedForDrag(false);
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      if (!kanbanCardBodyDraggable || !isTouchLikePointer(event)) {
        return;
      }
      if (!requireArmRef.current) {
        return;
      }
      touchStartRef.current = { x: event.clientX, y: event.clientY };
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        touchArmedRef.current = true;
        touchStartRef.current = null;
        setTouchArmedForDrag(true);
      }, longPressMs);
    },
    [kanbanCardBodyDraggable, longPressMs],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      if (!isTouchLikePointer(event)) {
        return;
      }
      const start = touchStartRef.current;
      if (start == null) {
        return;
      }
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > cancelMoveSlopPx || dy > cancelMoveSlopPx) {
        clearLongPressState();
      }
    },
    [cancelMoveSlopPx, clearLongPressState],
  );

  useLayoutEffect(() => {
    return () => {
      clearLongPressState();
    };
  }, [clearLongPressState]);

  const canDragForNative = useCallback((_args: ElementGetFeedbackArgs): boolean => {
    if (!requireArmRef.current) {
      return true;
    }
    return touchArmedRef.current;
  }, []);

  const onPointerUp = useCallback((): void => {
    if (kanbanNativeCardDragActiveRef.current) {
      return;
    }
    clearLongPressState();
  }, [clearLongPressState]);

  const onPointerCancel = useCallback((): void => {
    if (kanbanNativeCardDragActiveRef.current) {
      return;
    }
    clearLongPressState();
  }, [clearLongPressState]);

  return useMemo(
    () => ({
      touchArmedForDrag,
      clearLongPressState,
      canDragForNative,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    }),
    [
      touchArmedForDrag,
      clearLongPressState,
      canDragForNative,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    ],
  );
}

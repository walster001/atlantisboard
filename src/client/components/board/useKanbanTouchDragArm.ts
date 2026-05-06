import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

interface TouchStartPoint {
  readonly x: number;
  readonly y: number;
}

export interface UseKanbanTouchDragArmResult {
  readonly touchArmedForDrag: boolean;
  readonly clearLongPressState: () => void;
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
}

export function useKanbanTouchDragArm(kanbanCardBodyDraggable: boolean): UseKanbanTouchDragArmResult {
  const [touchArmedForDrag, setTouchArmedForDrag] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<TouchStartPoint | null>(null);

  const clearLongPressState = useCallback((): void => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
    setTouchArmedForDrag(false);
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      if (!kanbanCardBodyDraggable || event.pointerType !== 'touch') {
        return;
      }
      touchStartRef.current = { x: event.clientX, y: event.clientY };
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      longPressTimerRef.current = window.setTimeout(() => {
        setTouchArmedForDrag(true);
      }, 280);
    },
    [kanbanCardBodyDraggable],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      if (event.pointerType !== 'touch') {
        return;
      }
      const start = touchStartRef.current;
      if (start == null) {
        return;
      }
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > 10 || dy > 10) {
        clearLongPressState();
      }
    },
    [clearLongPressState],
  );

  useLayoutEffect(() => {
    return () => {
      clearLongPressState();
    };
  }, [clearLongPressState]);

  return {
    touchArmedForDrag,
    clearLongPressState,
    onPointerDown,
    onPointerMove,
    onPointerUp: clearLongPressState,
    onPointerCancel: clearLongPressState,
  };
}

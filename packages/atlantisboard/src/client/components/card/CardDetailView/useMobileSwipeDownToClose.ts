import { useCallback, useRef } from 'react';

/** Minimum downward travel (px) from touch start to end to dismiss. */
const CLOSE_THRESHOLD_PX = 72;
/** Vertical movement must dominate horizontal by this ratio to count as a dismiss swipe. */
const VERTICAL_OVER_HORIZONTAL = 1.15;

export interface MobileSwipeDownToCloseTouchHandlers {
  readonly onTouchStart: (event: React.TouchEvent) => void;
  readonly onTouchMove: (event: React.TouchEvent) => void;
  readonly onTouchEnd: (event: React.TouchEvent) => void;
  readonly onTouchCancel: () => void;
}

/**
 * When `enabled`, a downward swipe that starts on the attached element and is mostly vertical
 * calls `onClose` — intended for the card detail modal header on mobile.
 */
export function useMobileSwipeDownToClose(
  onClose: () => void,
  enabled: boolean,
): { readonly touchHandlers: MobileSwipeDownToCloseTouchHandlers } {
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const armedRef = useRef(false);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled || event.touches.length !== 1) {
        return;
      }
      armedRef.current = true;
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled || !armedRef.current || event.touches.length !== 1) {
        return;
      }
      const dy = event.touches[0].clientY - startYRef.current;
      const dx = event.touches[0].clientX - startXRef.current;
      if (dy < -12 || (Math.abs(dx) > 24 && Math.abs(dx) > dy * VERTICAL_OVER_HORIZONTAL)) {
        armedRef.current = false;
      }
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (!enabled) {
        return;
      }
      if (!armedRef.current) {
        return;
      }
      armedRef.current = false;
      const touch = event.changedTouches[0];
      if (touch == null) {
        return;
      }
      const dy = touch.clientY - startYRef.current;
      const dx = touch.clientX - startXRef.current;
      if (
        dy >= CLOSE_THRESHOLD_PX &&
        dy >= Math.abs(dx) * VERTICAL_OVER_HORIZONTAL
      ) {
        onClose();
      }
    },
    [enabled, onClose],
  );

  const onTouchCancel = useCallback(() => {
    armedRef.current = false;
  }, []);

  const touchHandlers: MobileSwipeDownToCloseTouchHandlers = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };

  return { touchHandlers };
}

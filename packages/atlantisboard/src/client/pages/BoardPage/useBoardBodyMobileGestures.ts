import { useLayoutEffect, useRef } from 'react';

export function useBoardBodyMobileGestures(isMobile: boolean, navigateHome: () => void): void {
  const swipeRef = useRef<{ active: boolean; startX: number; startY: number; fromTop: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    fromTop: false,
  });

  useLayoutEffect(() => {
    const body = document.querySelector('.board-page__body');
    if (!(body instanceof HTMLElement) || !isMobile) {
      return;
    }
    // Mobile-only: keep the swipe-down-from-top gesture (back to board list).
    // Horizontal list navigation is handled by the board carousel on mobile.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') {
        return;
      }
      swipeRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        fromTop: event.clientY <= 28,
      };
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!swipeRef.current.active || !swipeRef.current.fromTop || event.pointerType !== 'touch') {
        return;
      }
      const dy = event.clientY - swipeRef.current.startY;
      const dx = Math.abs(event.clientX - swipeRef.current.startX);
      if (dy > 92 && dx < 48) {
        swipeRef.current.active = false;
        navigateHome();
      }
    };
    const onPointerEnd = (): void => {
      swipeRef.current.active = false;
    };

    body.addEventListener('pointerdown', onPointerDown, { passive: true });
    body.addEventListener('pointermove', onPointerMove, { passive: true });
    body.addEventListener('pointerup', onPointerEnd, { passive: true });
    body.addEventListener('pointercancel', onPointerEnd, { passive: true });
    return () => {
      body.removeEventListener('pointerdown', onPointerDown);
      body.removeEventListener('pointermove', onPointerMove);
      body.removeEventListener('pointerup', onPointerEnd);
      body.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [isMobile, navigateHome]);
}

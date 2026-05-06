import { useLayoutEffect, useRef } from 'react';
import { snapBoardBodyToNearestListColumn } from '../../utils/snapMobileBoardColumnScroll.js';

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
    const touchState = {
      active: false,
      edgeGesture: false,
      startX: 0,
      startY: 0,
      lastX: 0,
    };
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
    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (touch == null) {
        return;
      }
      const edgeThreshold = 28;
      const vw = window.innerWidth;
      touchState.active = true;
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
      touchState.lastX = touch.clientX;
      touchState.edgeGesture = touch.clientX <= edgeThreshold || touch.clientX >= vw - edgeThreshold;
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (!touchState.active || !touchState.edgeGesture) {
        return;
      }
      const touch = event.touches[0];
      if (touch == null) {
        return;
      }
      const dx = touch.clientX - touchState.startX;
      const dy = touch.clientY - touchState.startY;
      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 6) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      const delta = touch.clientX - touchState.lastX;
      body.scrollLeft -= delta;
      touchState.lastX = touch.clientX;
    };
    const onTouchEnd = (): void => {
      touchState.active = false;
      touchState.edgeGesture = false;
    };

    let boardFingerDown = false;
    let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
    const clearScrollIdleTimer = (): void => {
      if (scrollIdleTimer != null) {
        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = null;
      }
    };
    const scheduleSnapAfterScrollIdle = (): void => {
      clearScrollIdleTimer();
      scrollIdleTimer = setTimeout(() => {
        scrollIdleTimer = null;
        if (boardFingerDown) {
          return;
        }
        snapBoardBodyToNearestListColumn(body);
      }, 160);
    };
    const onBoardTouchStartCapture = (event: TouchEvent): void => {
      boardFingerDown = event.touches.length > 0;
      clearScrollIdleTimer();
    };
    const onBoardTouchEndCapture = (event: TouchEvent): void => {
      boardFingerDown = event.touches.length > 0;
      if (!boardFingerDown) {
        scheduleSnapAfterScrollIdle();
      }
    };
    const onBoardScroll = (): void => {
      if (boardFingerDown) {
        return;
      }
      scheduleSnapAfterScrollIdle();
    };
    const onBoardScrollEnd = (): void => {
      clearScrollIdleTimer();
      snapBoardBodyToNearestListColumn(body);
    };

    body.addEventListener('touchstart', onBoardTouchStartCapture, { passive: true, capture: true });
    body.addEventListener('touchend', onBoardTouchEndCapture, { passive: true, capture: true });
    body.addEventListener('touchcancel', onBoardTouchEndCapture, { passive: true, capture: true });
    body.addEventListener('scroll', onBoardScroll, { passive: true });
    if ('onscrollend' in window) {
      body.addEventListener('scrollend', onBoardScrollEnd, { passive: true });
    }

    body.addEventListener('pointerdown', onPointerDown, { passive: true });
    body.addEventListener('pointermove', onPointerMove, { passive: true });
    body.addEventListener('pointerup', onPointerEnd, { passive: true });
    body.addEventListener('pointercancel', onPointerEnd, { passive: true });
    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('touchend', onTouchEnd, { passive: true });
    body.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      clearScrollIdleTimer();
      body.removeEventListener('touchstart', onBoardTouchStartCapture, { capture: true });
      body.removeEventListener('touchend', onBoardTouchEndCapture, { capture: true });
      body.removeEventListener('touchcancel', onBoardTouchEndCapture, { capture: true });
      body.removeEventListener('scroll', onBoardScroll);
      if ('onscrollend' in window) {
        body.removeEventListener('scrollend', onBoardScrollEnd);
      }
      body.removeEventListener('pointerdown', onPointerDown);
      body.removeEventListener('pointermove', onPointerMove);
      body.removeEventListener('pointerup', onPointerEnd);
      body.removeEventListener('pointercancel', onPointerEnd);
      body.removeEventListener('touchstart', onTouchStart);
      body.removeEventListener('touchmove', onTouchMove);
      body.removeEventListener('touchend', onTouchEnd);
      body.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMobile, navigateHome]);
}

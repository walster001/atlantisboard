const TOUCH_SCROLL_AXIS_SLOP_PX = 8;
const INERTIA_MIN_VELOCITY_PX_PER_MS = 0.035;
const INERTIA_DECAY_PER_SECOND = 4.2;
const INERTIA_VELOCITY_WINDOW_MS = 120;

interface TouchVelocitySample {
  readonly timeMs: number;
  readonly clientY: number;
}

function resolveEmojiMartScrollRoot(rootEl: HTMLElement): HTMLElement | null {
  const scroll = rootEl.querySelector('em-emoji-picker')?.shadowRoot?.querySelector('.scroll');
  return scroll instanceof HTMLElement ? scroll : null;
}

/** iOS + scroll-lock: finger-anchored drag per rAF, then exponential decay inertia on release. */
export function installMobileTouchScrollFallback(rootEl: HTMLElement): () => void {
  let activeScroll: HTMLElement | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let startScrollTop = 0;
  let pendingClientY = 0;
  let axisLocked: 'vertical' | 'horizontal' | null = null;
  let dragRafId = 0;
  let inertiaRafId = 0;
  const velocitySamples: TouchVelocitySample[] = [];

  const stopInertia = (): void => {
    if (inertiaRafId !== 0) {
      cancelAnimationFrame(inertiaRafId);
      inertiaRafId = 0;
    }
  };

  const stopDrag = (): void => {
    if (dragRafId !== 0) {
      cancelAnimationFrame(dragRafId);
      dragRafId = 0;
    }
  };

  const resetTouchTracking = (): void => {
    activeScroll = null;
    axisLocked = null;
    velocitySamples.length = 0;
    stopDrag();
  };

  const clampScrollTop = (scroll: HTMLElement, scrollTop: number): number => {
    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    return Math.max(0, Math.min(maxScroll, scrollTop));
  };

  const desiredScrollTop = (scroll: HTMLElement, clientY: number): number => {
    return clampScrollTop(scroll, startScrollTop + (startClientY - clientY));
  };

  const recordVelocitySample = (clientY: number): void => {
    const timeMs = performance.now();
    velocitySamples.push({ timeMs, clientY });
    const cutoff = timeMs - INERTIA_VELOCITY_WINDOW_MS;
    while (velocitySamples.length > 0 && velocitySamples[0].timeMs < cutoff) {
      velocitySamples.shift();
    }
  };

  const releaseVelocityPxPerMs = (): number => {
    if (velocitySamples.length < 2) {
      return 0;
    }
    const first = velocitySamples[0];
    const last = velocitySamples[velocitySamples.length - 1];
    const dt = last.timeMs - first.timeMs;
    if (dt <= 0) {
      return 0;
    }
    return (first.clientY - last.clientY) / dt;
  };

  const applyScrollFromTouch = (): void => {
    dragRafId = 0;
    const scroll = activeScroll;
    if (scroll == null) {
      return;
    }
    const targetTop = desiredScrollTop(scroll, pendingClientY);
    if (Math.abs(scroll.scrollTop - targetTop) < 0.5) {
      return;
    }
    scroll.scrollTop = targetTop;
  };

  const scheduleDragApply = (): void => {
    if (dragRafId !== 0) {
      return;
    }
    dragRafId = requestAnimationFrame(applyScrollFromTouch);
  };

  const startInertia = (scroll: HTMLElement, initialVelocityPxPerMs: number): void => {
    stopInertia();
    let velocity = initialVelocityPxPerMs;
    let lastTimeMs = performance.now();

    const tick = (): void => {
      const nowMs = performance.now();
      const dtMs = nowMs - lastTimeMs;
      lastTimeMs = nowMs;

      if (dtMs <= 0) {
        inertiaRafId = requestAnimationFrame(tick);
        return;
      }

      if (Math.abs(velocity) < INERTIA_MIN_VELOCITY_PX_PER_MS) {
        inertiaRafId = 0;
        return;
      }

      const beforeTop = scroll.scrollTop;
      const nextTop = clampScrollTop(scroll, beforeTop + velocity * dtMs);
      scroll.scrollTop = nextTop;

      if (nextTop === beforeTop) {
        inertiaRafId = 0;
        return;
      }

      velocity *= Math.exp((-INERTIA_DECAY_PER_SECOND * dtMs) / 1000);
      inertiaRafId = requestAnimationFrame(tick);
    };

    inertiaRafId = requestAnimationFrame(tick);
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1 || !event.composedPath().includes(rootEl)) {
      return;
    }
    stopInertia();
    const scroll = resolveEmojiMartScrollRoot(rootEl);
    if (scroll == null || scroll.scrollHeight <= scroll.clientHeight + 1) {
      return;
    }
    const touch = event.touches[0];
    activeScroll = scroll;
    startClientX = touch.clientX;
    startClientY = touch.clientY;
    pendingClientY = touch.clientY;
    startScrollTop = scroll.scrollTop;
    axisLocked = null;
    velocitySamples.length = 0;
    recordVelocitySample(touch.clientY);
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (activeScroll == null || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];

    if (axisLocked == null) {
      const totalDy = touch.clientY - startClientY;
      const totalDx = touch.clientX - startClientX;
      if (
        Math.abs(totalDy) < TOUCH_SCROLL_AXIS_SLOP_PX &&
        Math.abs(totalDx) < TOUCH_SCROLL_AXIS_SLOP_PX
      ) {
        return;
      }
      axisLocked = Math.abs(totalDy) >= Math.abs(totalDx) ? 'vertical' : 'horizontal';
    }

    if (axisLocked !== 'vertical') {
      return;
    }

    pendingClientY = touch.clientY;
    recordVelocitySample(touch.clientY);

    const targetTop = desiredScrollTop(activeScroll, touch.clientY);
    if (Math.abs(activeScroll.scrollTop - targetTop) < 1) {
      return;
    }

    scheduleDragApply();
  };

  const onTouchEnd = (): void => {
    const scroll = activeScroll;
    const wasVertical = axisLocked === 'vertical';
    const releaseVelocity = wasVertical ? releaseVelocityPxPerMs() : 0;
    resetTouchTracking();

    if (
      scroll != null &&
      wasVertical &&
      Math.abs(releaseVelocity) >= INERTIA_MIN_VELOCITY_PX_PER_MS
    ) {
      startInertia(scroll, releaseVelocity);
    }
  };

  const capture: AddEventListenerOptions = { capture: true };
  rootEl.addEventListener('touchstart', onTouchStart, { ...capture, passive: true });
  rootEl.addEventListener('touchmove', onTouchMove, { ...capture, passive: true });
  rootEl.addEventListener('touchend', onTouchEnd, { ...capture, passive: true });
  rootEl.addEventListener('touchcancel', onTouchEnd, { ...capture, passive: true });

  return () => {
    resetTouchTracking();
    stopInertia();
    rootEl.removeEventListener('touchstart', onTouchStart, capture);
    rootEl.removeEventListener('touchmove', onTouchMove, capture);
    rootEl.removeEventListener('touchend', onTouchEnd, capture);
    rootEl.removeEventListener('touchcancel', onTouchEnd, capture);
  };
}

export function resolveEmojiMartScrollTargets(rootEl: HTMLElement): readonly HTMLElement[] {
  const targets: HTMLElement[] = [rootEl];
  const host = rootEl.querySelector('em-emoji-picker');
  if (host instanceof HTMLElement) {
    targets.push(host);
  }
  const scroll = resolveEmojiMartScrollRoot(rootEl);
  if (scroll != null) {
    targets.push(scroll);
  }
  return targets;
}

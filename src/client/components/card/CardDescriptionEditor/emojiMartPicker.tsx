import { lazy, useEffect, useRef, type CSSProperties } from 'react';
import { EMOJI_SPRITESHEET_PUBLIC_PATH } from '../../../../shared/twemojiPublic.js';
import {
  CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
  CARD_DETAIL_MODAL_BACKGROUND_HEX,
} from '../cardDetailSectionUi.js';

export interface EmojiMartLazyProps {
  readonly onEmojiSelect: (payload: unknown) => void;
  readonly rgbBackground: string;
  readonly rgbColor: string;
  readonly layout?: 'popover' | 'fullscreen';
  /** Scroll surfaces for react-remove-scroll `shards` (portaled fullscreen + card detail modal). */
  readonly onScrollTargetsChange?: (targets: readonly HTMLElement[]) => void;
}

/** Fullscreen shell only — same emoji-mart behavior as desktop (all categories, native nav scroll). */
const EMOJI_MART_MOBILE_FULLSCREEN_SHADOW_CSS = `
:host {
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  --category-icon-size: 28px;
}
:host,
#root.flex.flex-column {
  touch-action: pan-y;
}
#root.flex.flex-column {
  height: 100%;
  min-height: 0;
}
#nav {
  flex-shrink: 0;
  order: 10;
  padding-top: 10px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--em-color-border);
  background: rgb(var(--em-rgb-background));
}
#nav button {
  min-height: 48px;
}
#nav button svg,
#nav button img {
  width: var(--category-icon-size) !important;
  height: var(--category-icon-size) !important;
}
`;

/**
 * emoji-mart shadow DOM: single scroll surface (`.scroll`) for all categories; `#nav` only
 * calls `scrollTo` on click. Wheel stays on `.scroll` (overscroll contain); scrollbar track always shown.
 */
const EMOJI_MART_SHADOW_FIX_CSS = `
#root.flex.flex-column {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
#nav {
  flex-shrink: 0;
}
.scroll.flex-grow {
  /* height:0 + flex-grow keeps overflow on .scroll (iOS flex columns otherwise grow with content). */
  min-height: 0;
  height: 0;
  flex: 1 1 0%;
}
/* Inline height:100% on wrappers breaks scrollHeight; content must drive the inner column. */
.scroll.flex-grow > div {
  height: auto !important;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.scroll.flex-grow > div > div {
  height: auto !important;
}
.category + .category {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--em-color-border);
}
.category .sticky {
  margin-bottom: 6px;
}
.scroll {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: var(--em-color-border) rgb(var(--em-rgb-background));
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
.scroll::-webkit-scrollbar-track {
  background-color: rgba(0, 0, 0, 0.07);
  border-radius: 8px;
}
.scroll::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 3px solid rgb(var(--em-rgb-background));
  border-radius: 8px;
  background-color: var(--em-color-border) !important;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--em-color-border-over) !important;
}
`;

function getEmojiMartShadow(rootEl: HTMLElement): ShadowRoot | null {
  const host = rootEl.querySelector('em-emoji-picker');
  return host?.shadowRoot ?? null;
}

function nudgeScrollLayoutOnce(shadow: ShadowRoot): void {
  const scrollEl = shadow.querySelector('.scroll');
  if (!(scrollEl instanceof HTMLElement)) {
    return;
  }
  void scrollEl.offsetHeight;
  // Force layout recalc in shadow DOM (read scrollTop, then write same value).
  const scrollTop = scrollEl.scrollTop;
  scrollEl.scrollTop = scrollTop;
}

function injectShadowStyles(
  shadow: ShadowRoot,
  attr: string,
  css: string,
): boolean {
  if (shadow.querySelector(`style[${attr}]`) != null) {
    return false;
  }
  const style = document.createElement('style');
  style.setAttribute(attr, '1');
  style.textContent = css;
  shadow.appendChild(style);
  return true;
}

function resolveEmojiMartScrollRoot(rootEl: HTMLElement): HTMLElement | null {
  const scroll = getEmojiMartShadow(rootEl)?.querySelector('.scroll');
  return scroll instanceof HTMLElement ? scroll : null;
}

const TOUCH_SCROLL_AXIS_SLOP_PX = 8;
/** px/ms — below this, release does not start inertia (~35 px/s). */
const INERTIA_MIN_VELOCITY_PX_PER_MS = 0.035;
/** Exponential decay per second (higher stops sooner; ~3–5 feels iOS-like). */
const INERTIA_DECAY_PER_SECOND = 4.2;
const INERTIA_VELOCITY_WINDOW_MS = 120;

interface TouchVelocitySample {
  readonly timeMs: number;
  readonly clientY: number;
}

/**
 * iOS + scroll-lock: native `.scroll` touch pan often does nothing. Finger-anchored drag per rAF,
 * then exponential decay inertia on release. Skips drag updates when native scroll already matched.
 */
function installMobileTouchScrollFallback(rootEl: HTMLElement): () => void {
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

function resolveEmojiMartScrollTargets(rootEl: HTMLElement): readonly HTMLElement[] {
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

function watchEmojiMartScrollTargets(
  rootEl: HTMLElement,
  onScrollTargetsChange: ((targets: readonly HTMLElement[]) => void) | undefined,
): () => void {
  if (onScrollTargetsChange == null) {
    return () => {};
  }

  let cancelled = false;
  let reportedKey = '';

  const publish = (): void => {
    if (cancelled) {
      return;
    }
    const targets = resolveEmojiMartScrollTargets(rootEl);
    const key = targets.map((target) => target.tagName + target.className).join('|');
    if (key === reportedKey) {
      return;
    }
    reportedKey = key;
    onScrollTargetsChange(targets);
  };

  publish();

  const pollId = window.setInterval(() => {
    publish();
    if (resolveEmojiMartScrollRoot(rootEl) != null) {
      window.clearInterval(pollId);
    }
  }, 48);

  const domObserver = new MutationObserver(() => {
    publish();
  });
  domObserver.observe(rootEl, { childList: true, subtree: true });

  return () => {
    cancelled = true;
    window.clearInterval(pollId);
    domObserver.disconnect();
    onScrollTargetsChange([]);
    reportedKey = '';
  };
}

function installEmojiMartPickerShadow(rootEl: HTMLElement, layout: 'popover' | 'fullscreen'): () => void {
  const fixAttr = 'data-card-desc-em-shadow-fix';
  const mobileAttr = 'data-card-desc-em-mobile-fullscreen';
  let cancelled = false;
  let rafChain = 0;
  let pollId: number | undefined;
  let observerTimeoutId: number | undefined;
  let observer: MutationObserver | undefined;

  const stopWatching = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (pollId !== undefined) {
      window.clearInterval(pollId);
      pollId = undefined;
    }
    if (observerTimeoutId !== undefined) {
      window.clearTimeout(observerTimeoutId);
      observerTimeoutId = undefined;
    }
  };

  const tryInject = (): boolean => {
    if (cancelled) {
      return false;
    }
    const shadow = getEmojiMartShadow(rootEl);
    if (!shadow?.querySelector('#root')) {
      return false;
    }

    let injected = false;
    if (injectShadowStyles(shadow, fixAttr, EMOJI_MART_SHADOW_FIX_CSS)) {
      injected = true;
    }
    if (layout === 'fullscreen' && injectShadowStyles(shadow, mobileAttr, EMOJI_MART_MOBILE_FULLSCREEN_SHADOW_CSS)) {
      injected = true;
    }
    if (injected) {
      nudgeScrollLayoutOnce(shadow);
    }
    return true;
  };

  if (tryInject()) {
    return () => {
      cancelled = true;
    };
  }

  pollId = window.setInterval(() => {
    if (tryInject()) {
      stopWatching();
    }
  }, 48);

  observerTimeoutId = window.setTimeout(() => {
    stopWatching();
  }, 8000);

  observer = new MutationObserver(() => {
    if (tryInject()) {
      stopWatching();
    }
  });
  observer.observe(rootEl, { childList: true, subtree: true });

  const scheduleRafRetries = (): void => {
    const step = (): void => {
      if (cancelled) {
        return;
      }
      if (tryInject()) {
        stopWatching();
        return;
      }
      rafChain += 1;
      if (rafChain < 12) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };
  scheduleRafRetries();

  return () => {
    cancelled = true;
    stopWatching();
  };
}

export const LazyEmojiMartPicker = lazy(async () => {
  const [{ default: EmojiPicker }, { default: emojiData }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);

  function EmojiMartPicker({
    onEmojiSelect,
    rgbBackground,
    rgbColor,
    layout = 'popover',
    onScrollTargetsChange,
  }: EmojiMartLazyProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = wrapRef.current;
      if (el == null) {
        return;
      }
      const cleanShadow = installEmojiMartPickerShadow(el, layout);
      const cleanScrollTargets =
        layout === 'fullscreen' ? watchEmojiMartScrollTargets(el, onScrollTargetsChange) : () => undefined;
      const useTouchScrollFallback =
        layout === 'fullscreen' && window.matchMedia('(pointer: coarse)').matches;
      const cleanTouchFallback = useTouchScrollFallback
        ? installMobileTouchScrollFallback(el)
        : () => undefined;

      const forwardWheelToEmojiScroll = (e: WheelEvent): void => {
        if (e.ctrlKey) {
          return;
        }
        if (!e.composedPath().includes(el)) {
          return;
        }
        const scrollEl = getEmojiMartShadow(el)?.querySelector('.scroll');
        if (!(scrollEl instanceof HTMLElement)) {
          return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
          return;
        }
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = Math.max(0, Math.min(max, scrollEl.scrollTop + e.deltaY));
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener('wheel', forwardWheelToEmojiScroll, { passive: false, capture: true });
      return () => {
        cleanShadow();
        cleanScrollTargets();
        cleanTouchFallback();
        el.removeEventListener('wheel', forwardWheelToEmojiScroll, { capture: true });
      };
    }, [layout, onScrollTargetsChange]);

    return (
      <div
        ref={wrapRef}
        className={
          layout === 'fullscreen'
            ? 'card-desc-emoji-mart-root card-desc-emoji-mart-root--fullscreen'
            : 'card-desc-emoji-mart-root'
        }
        data-emoji-layout={layout}
        style={
          {
            '--rgb-background': rgbBackground,
            '--rgb-color': rgbColor,
            '--rgb-input': CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
          } as CSSProperties
        }
      >
        <EmojiPicker
          data={emojiData}
          onEmojiSelect={onEmojiSelect}
          theme="light"
          locale="en"
          previewPosition="none"
          skinTonePosition="search"
          searchPosition="sticky"
          navPosition="bottom"
          perLine={9}
          maxFrequentRows={2}
          set="twitter"
          dynamicWidth
          getSpritesheetURL={() => EMOJI_SPRITESHEET_PUBLIC_PATH}
        />
      </div>
    );
  }

  return { default: EmojiMartPicker };
});

export function prefetchEmojiMartModules(): void {
  void Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);
}

export const emojiPickerPopoverDropdownStyles = {
  dropdown: {
    maxHeight: 'min(452px, calc(100dvh - 32px))',
    overflow: 'visible',
    backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
  },
} as const;

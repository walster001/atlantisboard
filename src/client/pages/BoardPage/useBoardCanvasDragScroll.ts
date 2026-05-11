import { useLayoutEffect, type RefObject } from 'react';

/**
 * Threshold (px) before a pointer-down + move is treated as a drag-scroll instead of a click.
 * Below this, the gesture is left as a normal click so card open / menu open / focus changes work.
 */
const DRAG_THRESHOLD_PX = 5;

/**
 * Positive hit-test: descendants matching this selector suppress canvas drag-scroll (list bodies,
 * cards, list chrome, composers, native controls). Uses `Element.closest` from the event target.
 *
 * Do **not** include `.board-column` — hits on the column shell’s own padding box report the
 * column root as `event.target`; those should still pan the board. Inner interactive regions are
 * covered below.
 */
const CANVAS_DRAG_IGNORE_SELECTOR = [
  '[data-kanban-list-body]',
  '[data-kanban-card-id]',
  '.board-column__header-row',
  '.board-column__add',
  '[data-kanban-delegated-drag-ignore="1"]',
  '.board-page__add-list',
  '.board-inline-composer',
  '.board-page__header',
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(',');

const DRAG_CLASS = 'board-page--canvas-dragging';
/** Set on `.board-page` while DnD (Pragmatic) is active — see `useKanbanViewController.ts`. */
const DND_ACTIVE_CLASS = 'board-page--kanban-dragging';

/** Delay before dropping the post-drag click guard if no synthetic click fires (leak safety). */
const POST_DRAG_CLICK_GUARD_MS = 400;

function shouldSuppressCanvasDragPointerDown(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  /* Padding / border hits on the list column shell — pan the board (target is the column root). */
  if (target.classList.contains('board-column')) {
    return false;
  }
  return target.closest(CANVAS_DRAG_IGNORE_SELECTOR) != null;
}

interface UseBoardCanvasDragScrollOptions {
  /** When true, the hook is fully inert (no listeners attached). Mobile uses a Carousel, not the body scroller. */
  readonly disabled: boolean;
  /**
   * Re-attach trigger. Initial mount paints `<Loader/>` instead of the body, so we re-run the
   * effect once a board is ready and the body node exists.
   */
  readonly boardId: string | null;
  /** The horizontally scrollable board canvas (`div.board-page__body`). */
  readonly bodyRef: RefObject<HTMLElement | null>;
}

/**
 * Click-and-drag horizontal scrolling for the board canvas (`bodyRef`).
 *
 * Behavior:
 * - Pointer primary button: mouse, pen, and touch (touch runs only when this hook is enabled —
 *   desktop/tablet; mobile passes `disabled` because the board uses a Carousel).
 * - `pointerdown` uses **capture** so we still see the real `event.target` and run before handlers
 *   that call `stopPropagation()` on descendants.
 * - `pointermove` uses `{ passive: false }` so `preventDefault()` applies once a drag begins (needed
 *   for touch / trackpad co-operation).
 * - Suppresses starts while Pragmatic card/list DnD is active (`board-page--kanban-dragging`).
 * - Threshold-gated drag vs click; one-shot capture-phase click guard after a real drag ends.
 */
export function useBoardCanvasDragScroll({
  disabled,
  boardId,
  bodyRef,
}: UseBoardCanvasDragScrollOptions): void {
  useLayoutEffect(() => {
    if (disabled || boardId == null) {
      return undefined;
    }

    const body = bodyRef.current;
    if (body == null) {
      return undefined;
    }

    const root = body.closest('.board-page');
    if (!(root instanceof HTMLElement)) {
      return undefined;
    }

    let activePointerId: number | null = null;
    let startClientX = 0;
    let startScrollLeft = 0;
    let dragging = false;

    const installPostDragClickGuard = (): void => {
      const swallow = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => {
        window.removeEventListener('click', swallow, { capture: true });
      }, POST_DRAG_CLICK_GUARD_MS);
    };

    const teardown = (cancelled: boolean): void => {
      if (activePointerId != null) {
        try {
          if (body.hasPointerCapture(activePointerId)) {
            body.releasePointerCapture(activePointerId);
          }
        } catch {
          // Capture may already be released (e.g. from `lostpointercapture`); safe to ignore.
        }
      }
      const wasDragging = dragging;
      activePointerId = null;
      dragging = false;
      root.classList.remove(DRAG_CLASS);
      if (wasDragging && !cancelled) {
        installPostDragClickGuard();
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      /* Primary button only (touch reports button 0). */
      if (event.button !== 0) {
        return;
      }
      // Already inside a card/list DnD — let `useKanbanPragmaticDnd` own scrollLeft.
      if (root.classList.contains(DND_ACTIVE_CLASS)) {
        return;
      }
      if (shouldSuppressCanvasDragPointerDown(event.target)) {
        return;
      }
      activePointerId = event.pointerId;
      startClientX = event.clientX;
      startScrollLeft = body.scrollLeft;
      dragging = false;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
      }
      const dx = event.clientX - startClientX;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragging = true;
        try {
          body.setPointerCapture(activePointerId);
        } catch {
          // Capture may fail if the pointer is no longer active; we still proceed with scrollLeft updates.
        }
        root.classList.add(DRAG_CLASS);
      }
      body.scrollLeft = startScrollLeft - dx;
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
      }
      teardown(false);
    };

    const onPointerCancel = (event: PointerEvent): void => {
      if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
      }
      teardown(true);
    };

    const onLostPointerCapture = (event: PointerEvent): void => {
      if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
      }
      teardown(true);
    };

    /* Capture: consistent target + runs before descendant `stopPropagation` on bubble. */
    body.addEventListener('pointerdown', onPointerDown, true);
    body.addEventListener('pointermove', onPointerMove, { passive: false });
    body.addEventListener('pointerup', onPointerUp);
    body.addEventListener('pointercancel', onPointerCancel);
    body.addEventListener('lostpointercapture', onLostPointerCapture);

    return () => {
      body.removeEventListener('pointerdown', onPointerDown, true);
      body.removeEventListener('pointermove', onPointerMove);
      body.removeEventListener('pointerup', onPointerUp);
      body.removeEventListener('pointercancel', onPointerCancel);
      body.removeEventListener('lostpointercapture', onLostPointerCapture);
      teardown(true);
    };
  }, [disabled, boardId, bodyRef]);
}

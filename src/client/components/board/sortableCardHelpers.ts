import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CardDB } from '../../store/database.js';
import { api } from '../../utils/api.js';

/** Same as IntersectionObserver `rootMargin` below (px on each side). */
const RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX = 240;

export function createCardLiftedDragPreview(cardRoot: HTMLElement): {
  readonly preview: HTMLElement;
  readonly offsetX: number;
  readonly offsetY: number;
} {
  const rect = cardRoot.getBoundingClientRect();
  const preview = cardRoot.cloneNode(true) as HTMLElement;
  preview.classList.add('board-page__dnd-card-lift-preview');
  preview.querySelectorAll('[data-kanban-delegated-drag-ignore="1"]').forEach((el) => el.remove());
  preview.style.width = `${Math.max(1, Math.round(rect.width))}px`;
  preview.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  preview.style.minHeight = '0';
  preview.style.setProperty('opacity', '1', 'important');
  preview.setAttribute('aria-hidden', 'true');
  return {
    preview,
    offsetX: Math.round(rect.width / 2),
    offsetY: Math.round(rect.height / 2),
  };
}

function isElementNearViewport(el: HTMLElement, marginPx: number): boolean {
  const r = el.getBoundingClientRect();
  const vw = globalThis.window.innerWidth;
  const vh = globalThis.window.innerHeight;
  const m = marginPx;
  return r.bottom > -m && r.top < vh + m && r.right > -m && r.left < vw + m;
}

export function useRichContentWhenNearViewport(): readonly [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) {
      return undefined;
    }

    let cancelled = false;
    let fallbackId: number | undefined;

    const markReady = (): void => {
      if (cancelled) {
        return;
      }
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
        fallbackId = undefined;
      }
      setReady(true);
    };

    fallbackId = globalThis.window.setTimeout(markReady, 100);

    if (isElementNearViewport(el, RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX)) {
      markReady();
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markReady();
        }
      },
      { root: null, rootMargin: `${RICH_CONTENT_NEAR_VIEWPORT_MARGIN_PX}px`, threshold: 0 },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      if (fallbackId !== undefined) {
        window.clearTimeout(fallbackId);
      }
      io.disconnect();
    };
  }, []);
  return [ref, ready] as const;
}

function normalizeObjectPath(raw: string): string {
  try {
    const parsed = new URL(raw);
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '').split('/').slice(-2).join('/');
  } catch {
    return decodeURIComponent(raw.split('?')[0] ?? raw).replace(/^\/+/, '').split('/').slice(-2).join('/');
  }
}

export function resolveCardCoverRenderUrl(card: CardDB): string {
  const cover = typeof card.cover === 'string' ? card.cover.trim() : '';
  if (cover === '') {
    return '';
  }
  const coverPath = normalizeObjectPath(cover);
  const coverAttachment = card.attachments.find((att) => normalizeObjectPath(att.url) === coverPath);
  if (coverAttachment != null) {
    return api.getAttachmentFileUrl(coverAttachment.id);
  }
  return api.resolveAttachmentUrl(cover);
}

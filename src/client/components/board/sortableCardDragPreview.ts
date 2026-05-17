import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import type { ElementEventPayloadMap } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { CardDB } from '../../store/database.js';
import { createCardLiftedDragPreview } from './sortableCardHelpers.js';

const MAX_PREVIEW_LABELS = 4;

/** iOS (all browsers) uses WebKit drag previews — full DOM clones get a black frame. */
export function shouldUseMinimalIosDragPreview(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function resolveCardPreviewBackground(card: CardDB): string {
  const color = card.color?.trim() ?? '';
  return color !== '' ? color : '#ffffff';
}

/**
 * WebKit snapshots a rectangular drag bitmap; rounded corners and box-shadow leave
 * transparent pixels that render black. The shell is square + opaque; the face clips content.
 */
function wrapIosOpaqueDragPreview(content: HTMLElement, widthPx: number, background: string): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'board-page__dnd-ios-drag-shell';
  shell.style.width = `${widthPx}px`;
  shell.style.maxWidth = `${widthPx}px`;
  shell.style.background = background;

  const face = document.createElement('div');
  face.className = 'board-page__dnd-ios-drag-face';
  face.style.background = background;
  face.appendChild(content);

  shell.appendChild(face);
  return shell;
}

function styleIosDragPreviewContainer(
  container: HTMLElement,
  options: { readonly widthPx: number; readonly background: string },
): void {
  container.className = 'board-page__dnd-drag-preview-container';
  container.style.width = `${options.widthPx}px`;
  container.style.maxWidth = `${options.widthPx}px`;
  container.style.boxSizing = 'border-box';
  container.style.background = options.background;
  container.style.border = 'none';
  container.style.outline = 'none';
  container.style.overflow = 'hidden';
  container.style.pointerEvents = 'none';
  container.style.boxShadow = 'none';
  container.style.padding = '0';
  container.style.margin = '0';
  container.style.borderRadius = '0';
  container.style.setProperty('-webkit-tap-highlight-color', 'transparent');
  container.style.setProperty('-webkit-backface-visibility', 'hidden');
}

function buildMinimalCardDragPreviewContent(card: CardDB): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'board-page__dnd-native-card-preview board-page__dnd-native-card-preview--inner';
  preview.setAttribute('aria-hidden', 'true');

  const color = card.color?.trim() ?? '';
  const hasColor = color !== '';

  const labels = card.labels.slice(0, MAX_PREVIEW_LABELS);
  if (labels.length > 0) {
    const labelsWrap = document.createElement('div');
    labelsWrap.className = 'board-page__dnd-native-card-preview-labels';
    for (const label of labels) {
      const badge = document.createElement('span');
      badge.className = 'board-page__dnd-native-card-preview-badge';
      badge.textContent = label.name;
      badge.style.backgroundColor = label.color;
      labelsWrap.appendChild(badge);
    }
    preview.appendChild(labelsWrap);
  }

  const title = document.createElement('div');
  title.className = 'board-page__dnd-native-card-preview-title';
  title.textContent = card.title;
  if (hasColor) {
    title.style.color = '#ffffff';
  }
  preview.appendChild(title);

  return preview;
}

function bindIosKanbanCardDragPreview(args: {
  readonly nativeSetDragImage: ElementEventPayloadMap['onGenerateDragPreview']['nativeSetDragImage'];
  readonly cardRoot: HTMLElement;
  readonly card: CardDB;
  readonly location: ElementEventPayloadMap['onGenerateDragPreview']['location'];
}): void {
  const { nativeSetDragImage, cardRoot, card, location } = args;
  const rect = cardRoot.getBoundingClientRect();
  const widthPx = Math.max(1, Math.round(rect.width));
  const background = resolveCardPreviewBackground(card);

  setCustomNativeDragPreview({
    nativeSetDragImage,
    getOffset: preserveOffsetOnSource({
      element: cardRoot,
      input: location.initial.input,
    }),
    render: ({ container }) => {
      styleIosDragPreviewContainer(container, { widthPx, background });
      const content = buildMinimalCardDragPreviewContent(card);
      const mounted = wrapIosOpaqueDragPreview(content, widthPx, background);
      container.appendChild(mounted);
      return () => {
        mounted.remove();
      };
    },
  });
}

/** Desktop: lifted clone with rotation/shadow (unchanged from pre-iOS work). */
function bindDesktopKanbanCardDragPreview(args: {
  readonly nativeSetDragImage: ElementEventPayloadMap['onGenerateDragPreview']['nativeSetDragImage'];
  readonly cardRoot: HTMLElement;
}): void {
  const { nativeSetDragImage, cardRoot } = args;
  const { preview, offsetX, offsetY } = createCardLiftedDragPreview(cardRoot);
  document.body.appendChild(preview);
  if (nativeSetDragImage != null) {
    nativeSetDragImage(preview, offsetX, offsetY);
  }
  requestAnimationFrame(() => {
    preview.remove();
  });
}

export function bindKanbanCardDragPreview(args: {
  readonly nativeSetDragImage: ElementEventPayloadMap['onGenerateDragPreview']['nativeSetDragImage'];
  readonly cardRoot: HTMLElement;
  readonly card: CardDB;
  readonly location: ElementEventPayloadMap['onGenerateDragPreview']['location'];
}): void {
  if (shouldUseMinimalIosDragPreview()) {
    bindIosKanbanCardDragPreview(args);
    return;
  }
  bindDesktopKanbanCardDragPreview(args);
}

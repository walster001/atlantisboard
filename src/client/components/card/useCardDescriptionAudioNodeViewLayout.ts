import type { NodeViewProps } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  clampWidth,
  dismissCardDescriptionEditorKeyboardOnMobile,
  isMobile,
  normalizeWidthPx,
} from './tiptapInlineButtonHelpers.js';
import {
  AUDIO_LAYOUT_LIMITS,
  applyAudioLayoutShellToElement,
  audioLayoutShellStyleFromPx,
  audioLayoutsEqual,
  buildPersistedAudioLayoutAttrs,
  clampHeight,
  normalizeHeightPx,
  readAudioLayoutFromAttrs,
  type AudioLayoutPx,
} from './tiptapAudioLayout.js';

export interface UseCardDescriptionAudioNodeViewLayoutResult {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly resizeActive: boolean;
  readonly isPointerDragging: boolean;
  readonly containerLayoutStyle: ReturnType<typeof audioLayoutShellStyleFromPx>;
  readonly startResize: (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handleContainerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handleContainerClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readonly handleMoveHandlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handleMoveHandleTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  readonly handleNodePointerDownCapture: () => void;
  readonly openAppearanceModal: () => void;
  readonly handleContainerDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function useCardDescriptionAudioNodeViewLayout({
  node,
  editor,
  getPos,
}: Pick<NodeViewProps, 'node' | 'editor' | 'getPos'>): UseCardDescriptionAudioNodeViewLayoutResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeActive, setResizeActiveState] = useState(false);
  const [isPointerDragging, setIsPointerDraggingState] = useState(false);
  const resizeActiveRef = useRef(false);
  const isPointerDraggingRef = useRef(false);
  const initialLayout = readAudioLayoutFromAttrs(node.attrs as Record<string, unknown>);
  const [liveWidthPx, setLiveWidthPx] = useState<string | null>(initialLayout.widthPx);
  const [liveHeightPx, setLiveHeightPx] = useState<string | null>(initialLayout.heightPx);
  const pendingLayoutRef = useRef<AudioLayoutPx>(initialLayout);

  const editable = editor.isEditable;
  const editorDom = editor.view.dom;

  const setResizeActive = useCallback((next: boolean) => {
    resizeActiveRef.current = next;
    setResizeActiveState(next);
  }, []);

  const setIsPointerDragging = useCallback((next: boolean) => {
    isPointerDraggingRef.current = next;
    setIsPointerDraggingState(next);
  }, []);

  const dismissMobileKeyboard = useCallback((): void => {
    dismissCardDescriptionEditorKeyboardOnMobile(editorDom);
    queueMicrotask(() => {
      dismissCardDescriptionEditorKeyboardOnMobile(editorDom);
    });
  }, [editorDom]);

  const applyLayoutToContainerDom = useCallback((layout: AudioLayoutPx, showResizeBorder: boolean): void => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    applyAudioLayoutShellToElement(container, layout.widthPx, layout.heightPx, showResizeBorder);
  }, []);

  const containerLayoutStyle = useMemo(
    () => audioLayoutShellStyleFromPx(liveWidthPx, liveHeightPx, resizeActive),
    [liveHeightPx, liveWidthPx, resizeActive],
  );

  const commitLayout = useCallback((): void => {
    setIsPointerDragging(false);

    if (typeof getPos !== 'function') {
      setResizeActive(false);
      return;
    }
    const pos = getPos();
    if (pos === undefined) {
      setResizeActive(false);
      return;
    }
    const nodeAt = editor.state.doc.nodeAt(pos);
    if (nodeAt == null) {
      setResizeActive(false);
      return;
    }
    const pending = pendingLayoutRef.current;
    const persisted = buildPersistedAudioLayoutAttrs(pending.widthPx, pending.heightPx);
    const merged = {
      ...nodeAt.attrs,
      ...persisted,
    };
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, merged));

    const normalizedWidth = pending.widthPx != null ? normalizeWidthPx(pending.widthPx) ?? null : null;
    const normalizedHeight =
      pending.heightPx != null ? normalizeHeightPx(pending.heightPx) ?? null : null;
    setLiveWidthPx(normalizedWidth);
    setLiveHeightPx(normalizedHeight);
    pendingLayoutRef.current = {
      widthPx: normalizedWidth,
      heightPx: normalizedHeight,
    };
    setResizeActive(false);
  }, [editor, getPos, setIsPointerDragging, setResizeActive]);

  useLayoutEffect(() => {
    if (resizeActiveRef.current || isPointerDraggingRef.current) {
      return;
    }
    const fromDoc = readAudioLayoutFromAttrs(node.attrs as Record<string, unknown>);
    setLiveWidthPx(fromDoc.widthPx);
    setLiveHeightPx(fromDoc.heightPx);
    pendingLayoutRef.current = fromDoc;
  }, [node.attrs.containerStyle, node.attrs.height, node.attrs.width, node.attrs.src]);

  useEffect(() => {
    const storage = editor.storage.audio;
    if (storage == null) {
      return undefined;
    }
    const flushCommit = (): void => {
      if (!editable || typeof getPos !== 'function') {
        return;
      }
      const pos = getPos();
      if (pos === undefined) {
        return;
      }
      const nodeAt = editor.state.doc.nodeAt(pos);
      if (nodeAt == null) {
        return;
      }
      const docLayout = readAudioLayoutFromAttrs(nodeAt.attrs as Record<string, unknown>);
      if (
        resizeActiveRef.current ||
        isPointerDraggingRef.current ||
        !audioLayoutsEqual(pendingLayoutRef.current, docLayout)
      ) {
        commitLayout();
      }
    };
    storage.pendingLayoutCommits.add(flushCommit);
    return () => {
      storage.pendingLayoutCommits.delete(flushCommit);
    };
  }, [commitLayout, editable, editor, getPos]);

  useEffect(() => {
    if (!resizeActive) {
      return undefined;
    }
    const onDocumentPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) {
        return;
      }
      if (containerRef.current?.contains(target)) {
        return;
      }
      commitLayout();
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    };
  }, [commitLayout, resizeActive]);

  const startResize = useCallback(
    (index: number) =>
      (event: ReactPointerEvent<HTMLDivElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        dismissMobileKeyboard();
        const container = containerRef.current;
        if (container == null) {
          return;
        }
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = container.offsetWidth;
        const startHeight = container.offsetHeight;
        const startLayout: AudioLayoutPx = {
          widthPx: `${startWidth}px`,
          heightPx: `${startHeight}px`,
        };
        pendingLayoutRef.current = startLayout;
        setIsPointerDragging(true);
        applyLayoutToContainerDom(startLayout, true);

        const onPointerMove = (moveEvent: PointerEvent): void => {
          const deltaX =
            index % 2 === 0 ? -(moveEvent.clientX - startX) : moveEvent.clientX - startX;
          const deltaY = index < 2 ? -(moveEvent.clientY - startY) : moveEvent.clientY - startY;
          const nextWidth = clampWidth(startWidth + deltaX, AUDIO_LAYOUT_LIMITS);
          const nextHeight = clampHeight(startHeight + deltaY, AUDIO_LAYOUT_LIMITS);
          const layout: AudioLayoutPx = {
            widthPx: `${nextWidth}px`,
            heightPx: `${nextHeight}px`,
          };
          pendingLayoutRef.current = layout;
          applyLayoutToContainerDom(layout, true);
        };

        const onPointerUp = (): void => {
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.removeEventListener('pointercancel', onPointerUp);
          commitLayout();
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      },
    [applyLayoutToContainerDom, commitLayout, dismissMobileKeyboard, setIsPointerDragging],
  );

  const handleContainerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!editable || !isMobile()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('.card-desc-audio-move-handle') != null) {
        return;
      }
      if (target.getAttribute('role') === 'presentation') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dismissMobileKeyboard();
    },
    [dismissMobileKeyboard, editable],
  );

  const handleContainerClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (!editable) {
        return;
      }
      event.stopPropagation();
      dismissMobileKeyboard();
      setResizeActive(true);
    },
    [dismissMobileKeyboard, editable, setResizeActive],
  );

  const handleMoveHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!editable) {
        return;
      }
      event.stopPropagation();
      dismissMobileKeyboard();
    },
    [dismissMobileKeyboard, editable],
  );

  const handleMoveHandleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>): void => {
      if (!editable) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      dismissMobileKeyboard();
    },
    [dismissMobileKeyboard, editable],
  );

  const handleNodePointerDownCapture = useCallback((): void => {
    if (!editable) {
      return;
    }
    dismissMobileKeyboard();
  }, [dismissMobileKeyboard, editable]);

  const openAppearanceModal = useCallback((): void => {
    if (!editable || typeof getPos !== 'function') {
      return;
    }
    const pos = getPos();
    if (pos === undefined) {
      return;
    }
    editor.storage.audio?.openEditModal?.(pos);
  }, [editable, editor, getPos]);

  const handleContainerDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (!editable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openAppearanceModal();
    },
    [editable, openAppearanceModal],
  );

  return {
    containerRef,
    resizeActive,
    isPointerDragging,
    containerLayoutStyle,
    startResize,
    handleContainerPointerDown,
    handleContainerClick,
    handleMoveHandlePointerDown,
    handleMoveHandleTouchStart,
    handleNodePointerDownCapture,
    openAppearanceModal,
    handleContainerDoubleClick,
  };
}

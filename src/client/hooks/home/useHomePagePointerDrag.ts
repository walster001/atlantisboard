import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { attachHomePagePointerDragListeners } from './homePagePointerDragListeners.js';
import type {
  BoardDropIndicator,
  FloatState,
  HomeBoardLongPressUi,
  HomePagePointerDragActions,
  HomePagePointerDragModels,
  HomePagePointerDragRefs,
  Session,
} from './homePagePointerDragTypes.js';

export type {
  BoardDropIndicator,
  HomeBoardLongPressPhase,
  HomeBoardLongPressUi,
  HomePagePointerDragActions,
  HomePagePointerDragModels,
  HomePagePointerDragRefs,
} from './homePagePointerDragTypes.js';

/**
 * Delegated home-page pointer drag (boards + workspace rows). Mirrors Kanban pointer capture + rAF pattern.
 */
export function useHomePagePointerDrag(
  refs: HomePagePointerDragRefs,
  modelsRef: MutableRefObject<HomePagePointerDragModels>,
  actionsRef: MutableRefObject<HomePagePointerDragActions>,
  /** When false, listeners are not attached (e.g. home list not mounted yet). */
  layoutReady: boolean,
  /** When true, touch drags on board cards require a long-press before reorder arms. */
  touchReorderRequiresLongPress: boolean,
): {
  readonly suppressBoardClickRef: MutableRefObject<boolean>;
  readonly floatPreview: FloatState;
  readonly draggingBoardId: string | null;
  readonly boardLongPressUi: HomeBoardLongPressUi | null;
  readonly boardDropIndicator: BoardDropIndicator;
} {
  const sessionRef = useRef<Session>(null);
  const rafRef = useRef<number | null>(null);
  const [floatPreview, setFloatPreview] = useState<FloatState>(null);
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const [boardLongPressUi, setBoardLongPressUi] = useState<HomeBoardLongPressUi | null>(null);
  const [boardDropIndicator, setBoardDropIndicatorState] = useState<BoardDropIndicator>(null);
  const boardDropIndicatorRef = useRef<BoardDropIndicator>(null);
  const setBoardDropIndicator = useCallback((next: BoardDropIndicator): void => {
    const prev = boardDropIndicatorRef.current;
    if (
      prev?.workspaceId === next?.workspaceId &&
      prev?.anchorBoardId === next?.anchorBoardId
    ) {
      return;
    }
    boardDropIndicatorRef.current = next;
    setBoardDropIndicatorState(next);
  }, []);
  const suppressBoardClickRef = useRef(false);

  const refsR = useRef(refs);
  refsR.current = refs;
  const touchReorderRequiresLongPressRef = useRef(touchReorderRequiresLongPress);
  touchReorderRequiresLongPressRef.current = touchReorderRequiresLongPress;

  useLayoutEffect(() => {
    if (!layoutReady) {
      return undefined;
    }
    const root = refsR.current.listRootRef.current;
    if (root == null) {
      return undefined;
    }

    return attachHomePagePointerDragListeners({
      root,
      sessionRef,
      rafRef,
      refsR,
      modelsRef,
      actionsRef,
      touchReorderRequiresLongPressRef,
      suppressBoardClickRef,
      setFloatPreview,
      setDraggingBoardId,
      setBoardLongPressUi,
      setBoardDropIndicator,
    });
  }, [actionsRef, layoutReady, modelsRef, setBoardDropIndicator, touchReorderRequiresLongPress]);

  return { suppressBoardClickRef, floatPreview, draggingBoardId, boardLongPressUi, boardDropIndicator };
}

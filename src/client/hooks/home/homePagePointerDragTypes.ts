import type { MutableRefObject, RefObject } from 'react';
import type { BoardDB, WorkspaceDB } from '../../store/database.js';

export const HOME_DRAG_DEADZONE_PX = 6;

/** Homepage board tiles only: touch must hold before reorder drag arms (ms). Matches Kanban card long-press. */
export const HOME_MOBILE_BOARD_REORDER_LONG_PRESS_MS = 400;

/** If the finger moves farther than this before the long-press completes, cancel arming (scroll intent). */
export const HOME_MOBILE_BOARD_LONG_PRESS_CANCEL_PX = 28;

export type HomeBoardLongPressPhase = 'arming' | 'armed';

export interface HomeBoardLongPressUi {
  readonly boardId: string;
  readonly phase: HomeBoardLongPressPhase;
}

export type BoardDropIndicator = {
  readonly workspaceId: string;
  readonly anchorBoardId: string | null;
} | null;

export type FloatState =
  | { readonly kind: 'board'; readonly name: string }
  | { readonly kind: 'workspace'; readonly name: string }
  | null;

export type PendingBoard = {
  readonly kind: 'pending_board';
  readonly boardId: string;
  readonly workspaceId: string;
  readonly handleEl: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
  /** Touch on mobile: false until long-press timer fires; desktop/mouse starts true. */
  readonly reorderArmed: boolean;
  readonly armTimerId: number | null;
};

export type ActiveBoard = {
  readonly kind: 'active_board';
  readonly boardId: string;
  readonly sourceWorkspaceId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement | null;
  readonly initialX: number;
  readonly initialY: number;
  readonly boardsBefore: BoardDB[];
};

export type PendingWorkspace = {
  readonly kind: 'pending_workspace';
  readonly workspaceId: string;
  readonly handleEl: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
};

export type ActiveWorkspace = {
  readonly kind: 'active_workspace';
  readonly workspaceId: string;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement | null;
  readonly initialX: number;
  readonly initialY: number;
  readonly orderedIdsBefore: string[];
};

export type Session = PendingBoard | ActiveBoard | PendingWorkspace | ActiveWorkspace | null;

export function dragDistanceExceedsDeadzone(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  minPx: number = HOME_DRAG_DEADZONE_PX,
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= minPx;
}

export function isBoardDragSurface(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('[data-home-board-no-drag="1"]') != null) {
    return false;
  }
  return target.closest('[data-home-board-draggable="1"]') != null;
}

export interface HomePagePointerDragRefs {
  readonly listRootRef: RefObject<HTMLDivElement | null>;
  readonly floatHostRef: RefObject<HTMLDivElement | null>;
  readonly previewPositionRef: MutableRefObject<{ x: number; y: number }>;
  readonly previewMetricsRef: MutableRefObject<{ width: number; height: number }>;
}

export interface HomePagePointerDragModels {
  readonly boards: BoardDB[];
  readonly orderedWorkspaceIds: readonly string[];
  readonly workspaces: readonly WorkspaceDB[];
  readonly userId: string | undefined;
  readonly homeBoardOrderByWorkspace: Readonly<Record<string, readonly string[]>> | undefined;
}

export interface HomePagePointerDragActions {
  readonly setAllBoards: React.Dispatch<React.SetStateAction<BoardDB[]>>;
  readonly setWorkspaceRowDrag: (next: { readonly workspaceId: string | null; readonly insertIndex: number | null }) => void;
  /** Workspace id whose board grid shows cross-workspace drop styling; `null` when not over a foreign row/grid. */
  readonly setBoardGridDropTarget: (workspaceId: string | null) => void;
  readonly setHomeDraggingClass: (on: boolean) => void;
  readonly canDragBoard: (board: BoardDB) => boolean;
  readonly refreshUserAfterBoardMove: () => Promise<void>;
  readonly hasBoardUpdate: (boardId: string) => boolean;
  readonly hasWorkspaceUpdate: (workspaceId: string) => boolean;
  readonly persistWorkspaceOrder: (orderedIds: string[]) => Promise<void>;
  readonly onMoveError: (message: string) => void;
}

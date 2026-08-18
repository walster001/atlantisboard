export const BOARD_TYPES = ['normal', 'visual-storytelling', 'step-guide'] as const;

export type BoardType = (typeof BOARD_TYPES)[number];

export const DEFAULT_BOARD_TYPE: BoardType = 'normal';

export const STEP_GUIDE_NOT_IMPLEMENTED_MESSAGE =
  'Step Guide boards are not implemented yet';

export function isBoardType(value: string): value is BoardType {
  return (BOARD_TYPES as readonly string[]).includes(value);
}

/** Visual storytelling creates a real board; step guide remains a stub. */
export function resolveCreateBoardPath(
  boardType: BoardType,
): 'normal' | 'visual-storytelling' | 'step-guide-stub' {
  if (boardType === 'visual-storytelling') return 'visual-storytelling';
  if (boardType === 'step-guide') return 'step-guide-stub'; // ponytail: listed only, no engine yet
  return 'normal';
}

/** Kanban columns vs vertical storyboard. Legacy/missing type is kanban. */
export function usesKanbanBoardLayout(boardType: BoardType | undefined): boolean {
  return boardType !== 'visual-storytelling';
}

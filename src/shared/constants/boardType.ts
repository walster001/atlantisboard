export const BOARD_TYPES = ['normal', 'visual-storytelling', 'step-guide'] as const;

export type BoardType = (typeof BOARD_TYPES)[number];

export const DEFAULT_BOARD_TYPE: BoardType = 'normal';

export const VISUAL_STORYTELLING_NOT_IMPLEMENTED_MESSAGE =
  'Visual Storytelling boards are not implemented yet';

export const STEP_GUIDE_NOT_IMPLEMENTED_MESSAGE =
  'Step Guide boards are not implemented yet';

export function isBoardType(value: string): value is BoardType {
  return (BOARD_TYPES as readonly string[]).includes(value);
}

/** Visual storytelling / step guide create is a stub until those board types are wired. */
export function resolveCreateBoardPath(
  boardType: BoardType,
): 'normal' | 'visual-storytelling-stub' | 'step-guide-stub' {
  if (boardType === 'visual-storytelling') return 'visual-storytelling-stub';
  if (boardType === 'step-guide') return 'step-guide-stub'; // ponytail: listed only, no engine yet
  return 'normal';
}

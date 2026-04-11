import type { BoardDB } from '../store/database.js';

export const DEFAULT_BOARD_LIST_MAX_CARDS = 1000;

export function getBoardListCardLimits(board: BoardDB): { max: number; enforce: boolean } {
  const max =
    typeof board.settings.listMaxCards === 'number' &&
    !Number.isNaN(board.settings.listMaxCards) &&
    board.settings.listMaxCards >= 1
      ? board.settings.listMaxCards
      : DEFAULT_BOARD_LIST_MAX_CARDS;
  const enforce = board.settings.listEnforceMaxCards !== false;
  return { max, enforce };
}

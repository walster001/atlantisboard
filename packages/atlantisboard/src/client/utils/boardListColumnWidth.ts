import type { CSSProperties } from 'react';
import type { BoardDB } from '../store/database.js';

export const DEFAULT_LIST_COLUMN_WIDTH_PX = 272;
export const BOARD_LIST_COLUMN_WIDTH_MIN_PX = 140;
export const BOARD_LIST_COLUMN_WIDTH_MAX_PX = 800;

export function getBoardListColumnWidthPx(board: BoardDB): number {
  const w = board.settings.listColumnWidthPx;
  if (
    typeof w === 'number' &&
    !Number.isNaN(w) &&
    w >= BOARD_LIST_COLUMN_WIDTH_MIN_PX &&
    w <= BOARD_LIST_COLUMN_WIDTH_MAX_PX
  ) {
    return Math.round(w);
  }
  return DEFAULT_LIST_COLUMN_WIDTH_PX;
}

export interface BoardListColumnWidthChrome {
  columnClassName: string;
  columnStyle: CSSProperties | undefined;
  trackClassName: string;
  trackStyle: CSSProperties | undefined;
}

/**
 * Shared width chrome for list columns and the “add list” / composer column on the board.
 * Columns are always responsive: `listColumnWidthPx` is the target width on wide viewports;
 * CSS scales down on narrower screens (see `.board-column--width-auto`).
 */
export function getBoardListColumnWidthChrome(board: BoardDB): BoardListColumnWidthChrome {
  const px = getBoardListColumnWidthPx(board);
  const preferVar: CSSProperties = {
    ['--board-list-column-prefer' as string]: `${px}px`,
  };
  return {
    columnClassName: 'board-column board-column--width-auto',
    columnStyle: preferVar,
    trackClassName: 'board-page__column-track board-page__column-track--auto',
    trackStyle: preferVar,
  };
}

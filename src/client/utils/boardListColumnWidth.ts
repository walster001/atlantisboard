import type { CSSProperties } from 'react';
import type { BoardDB } from '../store/database.js';
import {
  BOARD_LIST_COLUMN_WIDTH_MAX_PX,
  BOARD_LIST_COLUMN_WIDTH_MIN_PX,
  DEFAULT_LIST_COLUMN_WIDTH_PX,
} from '../../shared/constants/boardListColumnWidth.js';

export {
  BOARD_LIST_COLUMN_WIDTH_MAX_PX,
  BOARD_LIST_COLUMN_WIDTH_MIN_PX,
  DEFAULT_LIST_COLUMN_WIDTH_PX,
};

/** Matches `.board-column--width-auto` / `.board-page__column-track--auto` gutter. */
export const BOARD_LIST_COLUMN_VIEWPORT_GUTTER_PX = 120;
export const BOARD_LIST_COLUMN_VIEWPORT_FLOOR_PX = 200;

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

/**
 * Desktop slot width: preferred px, hard-capped 140–1000, then remaining viewport (not a 5-column fit).
 * Keep in sync with `.board-column--width-auto` / `.board-page__column-track--auto`.
 */
export function resolveBoardListColumnSlotWidthPx(
  preferredPx: number,
  viewportWidthPx: number,
): number {
  const responsiveMax = Math.max(
    BOARD_LIST_COLUMN_VIEWPORT_FLOOR_PX,
    Math.max(viewportWidthPx, 0) - BOARD_LIST_COLUMN_VIEWPORT_GUTTER_PX,
  );
  return Math.min(preferredPx, responsiveMax, BOARD_LIST_COLUMN_WIDTH_MAX_PX);
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
    ['--board-list-column-min' as string]: `${BOARD_LIST_COLUMN_WIDTH_MIN_PX}px`,
    ['--board-list-column-max' as string]: `${BOARD_LIST_COLUMN_WIDTH_MAX_PX}px`,
  };
  return {
    columnClassName: 'board-column board-column--width-auto',
    columnStyle: preferVar,
    trackClassName: 'board-page__column-track board-page__column-track--auto',
    trackStyle: preferVar,
  };
}

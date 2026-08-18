import { describe, expect, test } from 'bun:test';
import type { BoardDB } from '../src/client/store/database.js';
import {
  BOARD_LIST_COLUMN_WIDTH_MAX_PX,
  BOARD_LIST_COLUMN_WIDTH_MIN_PX,
  DEFAULT_LIST_COLUMN_WIDTH_PX,
  getBoardListColumnWidthChrome,
  getBoardListColumnWidthPx,
  resolveBoardListColumnSlotWidthPx,
} from '../src/client/utils/boardListColumnWidth.js';

function boardWithWidth(listColumnWidthPx: number): BoardDB {
  return { settings: { listColumnWidthPx } } as BoardDB;
}

describe('board list column width', () => {
  test('hard clamp is 140–1000px and 1000 is accepted', () => {
    expect(BOARD_LIST_COLUMN_WIDTH_MIN_PX).toBe(140);
    expect(BOARD_LIST_COLUMN_WIDTH_MAX_PX).toBe(1000);
    expect(getBoardListColumnWidthPx(boardWithWidth(1000))).toBe(1000);
    expect(getBoardListColumnWidthPx(boardWithWidth(1001))).toBe(DEFAULT_LIST_COLUMN_WIDTH_PX);
  });

  test('chrome exposes 140–1000 CSS clamp vars', () => {
    const style = getBoardListColumnWidthChrome(boardWithWidth(1000)).columnStyle as
      | Record<string, string>
      | undefined;
    expect(style?.['--board-list-column-prefer']).toBe('1000px');
    expect(style?.['--board-list-column-min']).toBe('140px');
    expect(style?.['--board-list-column-max']).toBe('1000px');
  });

  test('slot width uses preferred px on a typical desktop instead of a 5-column cap', () => {
    expect(resolveBoardListColumnSlotWidthPx(1000, 1920)).toBe(1000);
    expect(resolveBoardListColumnSlotWidthPx(272, 1920)).toBe(272);
    expect(resolveBoardListColumnSlotWidthPx(1000, 1000)).toBe(880);
    expect(resolveBoardListColumnSlotWidthPx(1200, 4000)).toBe(1000);
  });
});

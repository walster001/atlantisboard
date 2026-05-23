/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  boardExportPermissionKey,
  canExportBoardInAnyFormat,
  hasBoardExportFormatPermission,
  LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY,
} from '../src/shared/export/boardExportPermissions.js';

describe('boardExportPermissions', () => {
  it('maps each export format to a permission key', () => {
    expect(boardExportPermissionKey('csv')).toBe('export.board.csv');
    expect(boardExportPermissionKey('trello')).toBe('export.board.trello');
    expect(boardExportPermissionKey('wekan')).toBe('export.board.wekan');
    expect(boardExportPermissionKey('atlantisboard')).toBe('export.board.atlantisboard');
  });

  it('honors legacy json permission for JSON formats only', () => {
    const legacy = new Set([LEGACY_BOARD_EXPORT_JSON_PERMISSION_KEY]);
    expect(hasBoardExportFormatPermission(legacy, 'atlantisboard')).toBe(true);
    expect(hasBoardExportFormatPermission(legacy, 'trello')).toBe(true);
    expect(hasBoardExportFormatPermission(legacy, 'csv')).toBe(false);
  });

  it('detects any export capability', () => {
    expect(canExportBoardInAnyFormat(['export.board.csv'])).toBe(true);
    expect(canExportBoardInAnyFormat(['boards.view'])).toBe(false);
  });
});

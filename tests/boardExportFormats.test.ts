import { describe, expect, test } from 'bun:test';
import { BOARD_EXPORT_FORMATS, isBoardExportFormat } from '../src/shared/export/boardExportFormats.js';
import { hexToTrelloColorKey } from '../src/shared/export/hexToTrelloColorKey.js';
import { sanitizeBoardExportFilename } from '../src/server/services/export/loadBoardExportContext.js';

describe('board export formats', () => {
  test('supports csv, trello, wekan, and atlantisboard', () => {
    expect(BOARD_EXPORT_FORMATS).toEqual(['csv', 'trello', 'wekan', 'atlantisboard']);
    for (const format of BOARD_EXPORT_FORMATS) {
      expect(isBoardExportFormat(format)).toBe(true);
    }
    expect(isBoardExportFormat('json')).toBe(false);
  });

  test('hexToTrelloColorKey maps known blues', () => {
    expect(hexToTrelloColorKey('#0079BF')).toBe('blue');
  });

  test('sanitizeBoardExportFilename produces a safe download name', () => {
    expect(sanitizeBoardExportFilename('My Board / Test!', 'json')).toBe('My-Board-Test.json');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  appendBoardBackgroundPreviewQuery,
  isBoardBackgroundAssetUrl,
} from '../src/shared/boardBackgroundAsset.js';
import { resolveHomeBoardTileCoverDisplay } from '../src/client/utils/boardCoverDisplay.js';

describe('boardBackgroundAsset preview URLs', () => {
  test('appendBoardBackgroundPreviewQuery adds preview=card for board background paths', () => {
    expect(
      appendBoardBackgroundPreviewQuery(
        '/api/v1/board-backgrounds/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp',
      ),
    ).toBe(
      '/api/v1/board-backgrounds/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp?preview=card',
    );
  });

  test('appendBoardBackgroundPreviewQuery preserves existing query and hash', () => {
    expect(
      appendBoardBackgroundPreviewQuery(
        '/api/v1/board-backgrounds/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png?exp=123&sig=abc#tile',
      ),
    ).toBe(
      '/api/v1/board-backgrounds/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png?exp=123&sig=abc&preview=card#tile',
    );
  });

  test('appendBoardBackgroundPreviewQuery leaves non-board URLs unchanged', () => {
    const external = 'https://example.com/photo.jpg';
    expect(appendBoardBackgroundPreviewQuery(external)).toBe(external);
    expect(isBoardBackgroundAssetUrl(external)).toBe(false);
  });
});

describe('resolveHomeBoardTileCoverDisplay', () => {
  test('uses preview query for stored board background images', () => {
    const cover = resolveHomeBoardTileCoverDisplay(
      '/api/v1/board-backgrounds/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg',
    );
    expect(cover.isImageBackground).toBe(true);
    expect(cover.headerStyle.backgroundImage).toBe(
      'url(/api/v1/board-backgrounds/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg?preview=card)',
    );
  });

  test('keeps solid color backgrounds unchanged', () => {
    const cover = resolveHomeBoardTileCoverDisplay('#205081');
    expect(cover.isImageBackground).toBe(false);
    expect(cover.headerStyle.backgroundColor).toBe('#205081');
    expect(cover.headerStyle.backgroundImage).toBeUndefined();
  });
});

import { describe, expect, test } from 'bun:test';
import type { BoardDB } from '../src/client/store/database.js';
import { getBoardPageThemeStyle } from '../src/client/utils/boardThemeStyle.js';
import { createDefaultBoardThemeSettings } from '../src/shared/boardTheme.js';
import { buildBoardThemeCatalog } from '../src/shared/boardThemeCatalog.js';
import { SYSTEM_BOARD_THEME_SEEDS } from '../src/shared/boardThemeSeedData.js';

function sampleBoard(themeSettings: NonNullable<BoardDB['themeSettings']>): BoardDB {
  return {
    id: 'board-test',
    position: 0,
    name: 'Test Board',
    visibility: 'private',
    ownerId: 'user-1',
    members: [],
    settings: {
      allowComments: true,
      allowAttachments: true,
      cardCoverImages: true,
      showReminders: true,
    },
    themeSettings,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function imageThemeSettings(imageUrl: string, boardOpacity = 0.8) {
  const catalog = buildBoardThemeCatalog({ systemThemes: SYSTEM_BOARD_THEME_SEEDS, customThemes: [] });
  const base = createDefaultBoardThemeSettings(undefined, catalog);
  return {
    ...base,
    backgroundMode: 'image' as const,
    backgroundImageUrl: imageUrl,
    boardOpacity,
  };
}

describe('getBoardPageThemeStyle', () => {
  test('does not reuse cached image backgrounds when opacity and theme match but URLs differ', () => {
    const sharedOpacity = 0.75;
    const boardA = sampleBoard(
      imageThemeSettings('/api/v1/board-backgrounds/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', sharedOpacity),
    );
    const boardB = sampleBoard(
      imageThemeSettings('/api/v1/board-backgrounds/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png', sharedOpacity),
    );

    const styleA = getBoardPageThemeStyle(boardA);
    const styleB = getBoardPageThemeStyle(boardB);

    expect(styleA['--board-canvas-bg-image']).toBe(
      'url("/api/v1/board-backgrounds/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png")',
    );
    expect(styleB['--board-canvas-bg-image']).toBe(
      'url("/api/v1/board-backgrounds/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png")',
    );
    expect(styleA['--board-canvas-bg-image']).not.toBe(styleB['--board-canvas-bg-image']);
  });

  test('applies board opacity to lists only, not navbar', () => {
    const board = sampleBoard(imageThemeSettings('/api/v1/board-backgrounds/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 0.6));
    const style = getBoardPageThemeStyle(board);

    expect(style['--board-nav-bg-opacity']).toBe('1');
    expect(style['--board-list-bg-opacity']).toBe('0.6');
  });
});

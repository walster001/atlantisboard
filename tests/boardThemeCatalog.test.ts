import { describe, expect, test } from 'bun:test';
import {
  createDefaultBoardThemeSettings,
  dehydrateBoardThemeSettings,
  normalizeBoardThemeSettings,
} from '../src/shared/boardTheme.js';
import { buildBoardThemeCatalog } from '../src/shared/boardThemeCatalog.js';
import { BOARD_DEFAULT_THEME_ID, SYSTEM_BOARD_THEME_SEEDS } from '../src/shared/boardThemeSeedData.js';

describe('board theme catalog and persistence', () => {
  test('system seeds include the default theme id', () => {
    expect(SYSTEM_BOARD_THEME_SEEDS.some((theme) => theme.id === BOARD_DEFAULT_THEME_ID)).toBe(true);
  });

  test('dehydrate removes embedded theme payloads', () => {
    const catalog = buildBoardThemeCatalog({ systemThemes: SYSTEM_BOARD_THEME_SEEDS, customThemes: [] });
    const settings = createDefaultBoardThemeSettings(undefined, catalog);
    const stored = dehydrateBoardThemeSettings(settings);
    expect(stored.selectedThemeId).toBe(settings.selectedThemeId);
    expect(stored.selectedTheme).toBeUndefined();
    expect(stored.customThemes).toBeUndefined();
  });

  test('normalize hydrates selected theme from catalog when stored is dehydrated', () => {
    const catalog = buildBoardThemeCatalog({ systemThemes: SYSTEM_BOARD_THEME_SEEDS, customThemes: [] });
    const hydrated = createDefaultBoardThemeSettings(BOARD_DEFAULT_THEME_ID, catalog);
    const stored = dehydrateBoardThemeSettings(hydrated);
    const roundTrip = normalizeBoardThemeSettings(stored, undefined, catalog);
    expect(roundTrip.selectedTheme.id).toBe(BOARD_DEFAULT_THEME_ID);
    expect(roundTrip.selectedTheme.palette.canvasBg).toBe(hydrated.selectedTheme.palette.canvasBg);
  });

  test('custom themes resolve from catalog after dehydration', () => {
    const customTheme = {
      id: 'custom-test',
      name: 'Custom Test',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[0]!.palette },
    };
    const catalog = buildBoardThemeCatalog({
      systemThemes: SYSTEM_BOARD_THEME_SEEDS,
      customThemes: [customTheme],
    });
    const hydrated = normalizeBoardThemeSettings(
      {
        selectedThemeId: customTheme.id,
        selectedTheme: customTheme,
        customThemes: [customTheme],
        smartContrast: true,
        backgroundMode: 'theme',
      },
      undefined,
      catalog,
    );
    const stored = dehydrateBoardThemeSettings(hydrated);
    const roundTrip = normalizeBoardThemeSettings(stored, undefined, catalog);
    expect(roundTrip.selectedTheme.id).toBe('custom-test');
    expect(roundTrip.selectedTheme.name).toBe('Custom Test');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  dehydrateBoardThemeSettings,
  normalizeBoardThemeSettings,
} from '../src/shared/boardTheme.js';
import { buildBoardThemeCatalog } from '../src/shared/boardThemeCatalog.js';
import { SYSTEM_BOARD_THEME_SEEDS } from '../src/shared/boardThemeSeedData.js';
import {
  normalizeBoardThemeSettingsForClient,
  resetBoardThemeClientNormalizeForTests,
  setClientCustomBoardThemes,
} from '../src/client/utils/boardThemeClientNormalize.js';

describe('board theme hydration with shared catalog', () => {
  const sharedCustomTheme = {
    id: 'shared-custom-theme',
    name: 'Shared Custom',
    palette: { ...SYSTEM_BOARD_THEME_SEEDS[2]!.palette },
  };

  const sharedCatalog = buildBoardThemeCatalog({
    systemThemes: SYSTEM_BOARD_THEME_SEEDS,
    customThemes: [sharedCustomTheme],
  });

  test('dehydrated board theme resolves for any viewer when catalog is shared', () => {
    const stored = dehydrateBoardThemeSettings({
      selectedThemeId: sharedCustomTheme.id,
      selectedTheme: sharedCustomTheme,
      customThemes: [sharedCustomTheme],
      smartContrast: true,
      backgroundMode: 'theme',
    });

    const ownerHydrated = normalizeBoardThemeSettings(stored, undefined, sharedCatalog);
    expect(ownerHydrated.selectedTheme.id).toBe(sharedCustomTheme.id);
    expect(ownerHydrated.selectedTheme.name).toBe('Shared Custom');

    const memberHydrated = normalizeBoardThemeSettings(stored, undefined, sharedCatalog);
    expect(memberHydrated.selectedTheme.id).toBe(sharedCustomTheme.id);
    expect(memberHydrated.selectedTheme.name).toBe('Shared Custom');
  });

  test('member client resolves custom theme from shared catalog after load', () => {
    resetBoardThemeClientNormalizeForTests();
    setClientCustomBoardThemes([sharedCustomTheme]);

    const stored = dehydrateBoardThemeSettings({
      selectedThemeId: sharedCustomTheme.id,
      selectedTheme: sharedCustomTheme,
      customThemes: [sharedCustomTheme],
      smartContrast: true,
      backgroundMode: 'theme',
    });

    const normalized = normalizeBoardThemeSettingsForClient('board-member-view', stored);
    expect(normalized.selectedTheme.id).toBe(sharedCustomTheme.id);
    expect(normalized.selectedTheme.palette.canvasBg).toBe(sharedCustomTheme.palette.canvasBg);
    expect(normalized.customThemes.some((theme) => theme.id === sharedCustomTheme.id)).toBe(true);
  });

  test('member client applies server-hydrated selectedTheme when catalog is loaded', () => {
    resetBoardThemeClientNormalizeForTests();
    const serverHydrated = {
      selectedThemeId: sharedCustomTheme.id,
      selectedTheme: sharedCustomTheme,
      customThemes: [sharedCustomTheme],
      smartContrast: true,
      backgroundMode: 'theme' as const,
    };

    const normalized = normalizeBoardThemeSettingsForClient('board-member-view', serverHydrated);
    expect(normalized.selectedTheme.id).toBe(sharedCustomTheme.id);
    expect(normalized.selectedTheme.palette.canvasBg).toBe(sharedCustomTheme.palette.canvasBg);
    expect(normalized.customThemes.some((theme) => theme.id === sharedCustomTheme.id)).toBe(true);
  });
});

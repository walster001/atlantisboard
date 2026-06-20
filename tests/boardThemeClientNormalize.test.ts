import { describe, expect, test } from 'bun:test';
import { dehydrateBoardThemeSettings } from '../src/shared/boardTheme.js';
import { SYSTEM_BOARD_THEME_SEEDS } from '../src/shared/boardThemeSeedData.js';
import {
  boardThemeNeedsHydrationMerge,
  normalizeBoardThemeSettingsForClient,
  normalizeBoardThemeSettingsPatchForClient,
  rememberBoardThemeSettings,
  resetBoardThemeClientNormalizeForTests,
  setClientCustomBoardThemes,
} from '../src/client/utils/boardThemeClientNormalize.js';

describe('boardThemeClientNormalize', () => {
  test('system theme survives dehydrated socket payload without prior snapshot', () => {
    resetBoardThemeClientNormalizeForTests();
    const defaultId = SYSTEM_BOARD_THEME_SEEDS[0]!.id;
    const normalized = normalizeBoardThemeSettingsForClient('board-1', {
      selectedThemeId: defaultId,
      smartContrast: true,
      backgroundMode: 'theme',
    });
    expect(normalized.selectedTheme.id).toBe(defaultId);
  });

  test('custom theme needs merge when catalog lacks the theme id', () => {
    resetBoardThemeClientNormalizeForTests();
    const stored = {
      selectedThemeId: 'missing-custom-theme',
      smartContrast: true,
      backgroundMode: 'theme' as const,
    };
    expect(boardThemeNeedsHydrationMerge(stored)).toBe(true);
  });

  test('custom theme survives dehydrated payload when shared catalog is loaded', () => {
    resetBoardThemeClientNormalizeForTests();
    const customTheme = {
      id: 'custom-client-test',
      name: 'Client Custom',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[0]!.palette },
    };
    setClientCustomBoardThemes([customTheme]);
    const stored = dehydrateBoardThemeSettings({
      selectedThemeId: customTheme.id,
      selectedTheme: customTheme,
      customThemes: [customTheme],
      smartContrast: true,
      backgroundMode: 'theme',
    });
    expect(boardThemeNeedsHydrationMerge(stored)).toBe(false);

    const roundTrip = normalizeBoardThemeSettingsForClient('board-custom', stored);
    expect(roundTrip.selectedTheme.id).toBe(customTheme.id);
    expect(roundTrip.selectedTheme.name).toBe('Client Custom');
    expect(roundTrip.customThemes.some((theme) => theme.id === customTheme.id)).toBe(true);
  });

  test('custom theme survives dehydrated payload when prior hydrated snapshot exists', () => {
    resetBoardThemeClientNormalizeForTests();
    const customTheme = {
      id: 'custom-client-test',
      name: 'Client Custom',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[0]!.palette },
    };
    const hydrated = {
      selectedThemeId: customTheme.id,
      selectedTheme: customTheme,
      customThemes: [customTheme],
      smartContrast: true,
      backgroundMode: 'theme' as const,
    };
    rememberBoardThemeSettings('board-custom', hydrated);
    const stored = dehydrateBoardThemeSettings(hydrated);
    expect(boardThemeNeedsHydrationMerge(stored)).toBe(true);

    const roundTrip = normalizeBoardThemeSettingsForClient('board-custom', stored);
    expect(roundTrip.selectedTheme.id).toBe(customTheme.id);
    expect(roundTrip.selectedTheme.name).toBe('Client Custom');
    expect(roundTrip.customThemes.some((theme) => theme.id === customTheme.id)).toBe(true);
  });

  test('dehydrated themeSettings patch merges with existing hydrated snapshot', () => {
    resetBoardThemeClientNormalizeForTests();
    const customTheme = {
      id: 'custom-patch-test',
      name: 'Patch Custom',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[0]!.palette },
    };
    const hydrated = {
      selectedThemeId: customTheme.id,
      selectedTheme: customTheme,
      customThemes: [customTheme],
      smartContrast: true,
      backgroundMode: 'theme' as const,
    };
    const stored = dehydrateBoardThemeSettings(hydrated);
    const patched = normalizeBoardThemeSettingsPatchForClient('board-patch', stored, hydrated);
    expect(patched.selectedTheme.id).toBe(customTheme.id);
    expect(patched.selectedTheme.name).toBe('Patch Custom');
    expect(patched.customThemes.some((theme) => theme.id === customTheme.id)).toBe(true);
  });

  test('explicit prevThemeSettings overrides remembered snapshot', () => {
    resetBoardThemeClientNormalizeForTests();
    const rememberedTheme = {
      id: 'remembered-custom',
      name: 'Remembered',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[0]!.palette },
    };
    rememberBoardThemeSettings('board-explicit', {
      selectedThemeId: rememberedTheme.id,
      selectedTheme: rememberedTheme,
      customThemes: [rememberedTheme],
      smartContrast: true,
      backgroundMode: 'theme',
    });

    const explicitTheme = {
      id: 'explicit-custom',
      name: 'Explicit',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[1]!.palette },
    };
    const stored = dehydrateBoardThemeSettings({
      selectedThemeId: explicitTheme.id,
      selectedTheme: explicitTheme,
      customThemes: [explicitTheme],
      smartContrast: false,
      backgroundMode: 'theme',
    });

    const roundTrip = normalizeBoardThemeSettingsForClient('board-explicit', stored, {
      selectedThemeId: explicitTheme.id,
      selectedTheme: explicitTheme,
      customThemes: [explicitTheme],
      smartContrast: false,
      backgroundMode: 'theme',
    });
    expect(roundTrip.selectedTheme.id).toBe('explicit-custom');
    expect(roundTrip.selectedTheme.name).toBe('Explicit');
  });

  test('custom theme resolves from catalog when stored selectedThemeId matches catalog entry', () => {
    resetBoardThemeClientNormalizeForTests();
    const customTheme = {
      id: 'catalog-only-custom',
      name: 'Catalog Custom',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[2]!.palette },
    };
    setClientCustomBoardThemes([customTheme]);
    const stored = dehydrateBoardThemeSettings({
      selectedThemeId: customTheme.id,
      selectedTheme: customTheme,
      customThemes: [customTheme],
      smartContrast: true,
      backgroundMode: 'theme',
    });
    expect(boardThemeNeedsHydrationMerge(stored)).toBe(false);

    const normalized = normalizeBoardThemeSettingsForClient('board-catalog', {
      selectedThemeId: customTheme.id,
      smartContrast: false,
      backgroundMode: 'theme',
    });
    expect(normalized.selectedTheme.id).toBe(customTheme.id);
    expect(normalized.selectedTheme.palette.canvasBg).toBe(customTheme.palette.canvasBg);
  });

  test('server-hydrated payload applies for member with shared catalog loaded', () => {
    resetBoardThemeClientNormalizeForTests();
    const ownerTheme = {
      id: 'owner-hydrated-only',
      name: 'Owner Hydrated',
      palette: { ...SYSTEM_BOARD_THEME_SEEDS[1]!.palette },
    };
    const serverPayload = {
      selectedThemeId: ownerTheme.id,
      selectedTheme: ownerTheme,
      customThemes: [ownerTheme],
      smartContrast: false,
      backgroundMode: 'theme' as const,
    };
    expect(boardThemeNeedsHydrationMerge(dehydrateBoardThemeSettings(serverPayload))).toBe(true);

    const normalized = normalizeBoardThemeSettingsForClient('board-server-hydrated', serverPayload);
    expect(normalized.selectedTheme.id).toBe(ownerTheme.id);
    expect(normalized.selectedTheme.name).toBe('Owner Hydrated');
  });
});

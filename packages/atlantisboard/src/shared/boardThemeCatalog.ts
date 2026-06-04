import type { BoardThemeDefinition } from './boardTheme.js';
import { BOARD_DEFAULT_THEME_ID } from './boardThemeSeedData.js';
import { SYSTEM_BOARD_THEME_SEEDS } from './boardThemeSeedData.js';

export interface BoardThemeCatalog {
  readonly systemThemes: readonly BoardThemeDefinition[];
  readonly customThemes: readonly BoardThemeDefinition[];
}

function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

export function buildBoardThemeCatalog(params: {
  readonly systemThemes?: readonly BoardThemeDefinition[];
  readonly customThemes?: readonly BoardThemeDefinition[];
}): BoardThemeCatalog {
  return {
    systemThemes: (params.systemThemes ?? []).map(cloneTheme),
    customThemes: (params.customThemes ?? []).map(cloneTheme),
  };
}

export function buildFallbackBoardThemeCatalog(): BoardThemeCatalog {
  return buildBoardThemeCatalog({
    systemThemes: SYSTEM_BOARD_THEME_SEEDS,
    customThemes: [],
  });
}

export function allThemesFromCatalog(catalog: BoardThemeCatalog): readonly BoardThemeDefinition[] {
  return [...catalog.systemThemes, ...catalog.customThemes];
}

export function findBoardThemeInCatalog(
  themeId: string,
  catalog: BoardThemeCatalog,
): BoardThemeDefinition | null {
  const trimmed = themeId.trim();
  if (trimmed === '') {
    return null;
  }
  const found =
    catalog.customThemes.find((theme) => theme.id === trimmed) ??
    catalog.systemThemes.find((theme) => theme.id === trimmed);
  return found != null ? cloneTheme(found) : null;
}

export function isSystemBoardThemeId(themeId: string, catalog: BoardThemeCatalog): boolean {
  const trimmed = themeId.trim();
  return catalog.systemThemes.some((theme) => theme.id === trimmed);
}

export function defaultThemeFromCatalog(catalog: BoardThemeCatalog): BoardThemeDefinition {
  return (
    findBoardThemeInCatalog(BOARD_DEFAULT_THEME_ID, catalog) ??
    (catalog.systemThemes[0] != null
      ? cloneTheme(catalog.systemThemes[0])
      : cloneTheme(SYSTEM_BOARD_THEME_SEEDS[0]!))
  );
}

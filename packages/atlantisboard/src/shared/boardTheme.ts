import {
  BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS,
  BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES,
  SYSTEM_BOARD_THEME_SEEDS,
} from './boardThemeSeedData.js';
import {
  buildFallbackBoardThemeCatalog,
  defaultThemeFromCatalog,
  findBoardThemeInCatalog,
  isSystemBoardThemeId,
  type BoardThemeCatalog,
} from './boardThemeCatalog.js';

/**
 * Canonical board chrome palette. Values flow to the live board via
 * `getBoardPageThemeStyle` in `src/client/utils/boardThemeStyle.ts` as CSS custom properties
 * on `.board-page` (e.g. `--board-list-bg`, `--board-card-detail-bg`). Card detail UI also reads
 * those `--board-card-detail-*` vars when the card modal renders inside the board subtree.
 *
 * | Key | CSS variable | Primary consumers |
 * |-----|----------------|-------------------|
 * | navbarBg | --board-nav-bg | `.board-page__header` |
 * | (derived) | --board-nav-fg | Navbar title, icons, user label — `smartTextColor(navbarBg, #fff)`; see `boardThemePrefersNavbarLightForeground` |
 * | navbarBorder | --board-nav-border | Declared for theme; reserved for future nav chrome |
 * | canvasBg | --board-canvas-bg | `.board-page`, `.board-page__body` (when not image bg) |
 * | listBg | --board-list-bg | `.board-column`, composers |
 * | listHeaderText | --board-list-header-text | List titles; smartContrast may adjust |
 * | listMuted | --board-list-muted | Count, menu, add row |
 * | listMutedStrong | --board-list-muted-strong | Add row hover emphasis |
 * | listControlHoverBg | --board-list-control-hover-bg | List control hovers |
 * | listShadow | --board-list-shadow | Column / inline composer shadow |
 * | addListBg / addListBgHover | --board-add-list-bg / hover | Add list button |
 * | cardDetail* | --board-card-detail-* | Card detail modal + soft buttons |
 * | cardDetailTitleText | --board-card-detail-title-text | Main card title colour (contrast-adjusted when smart contrast is on) |
 * | (derived) | --board-card-detail-prose | Description editor / readonly body text |
 * | scrollbarColor | `--board-*-scrollbar-color` (thumb) | `unset` → navbar; otherwise palette value |
 * | scrollbarTrackColor | — | Persisted on themes; board UI always uses {@link BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA} for native scrollbar tracks |
 */
export interface BoardThemePalette {
  navbarBg: string;
  navbarBorder: string;
  canvasBg: string;
  listBg: string;
  listHeaderText: string;
  listMuted: string;
  listMutedStrong: string;
  listControlHoverBg: string;
  listShadow: string;
  addListBg: string;
  addListBgHover: string;
  cardDetailBg: string;
  cardDetailTitleText: string;
  cardDetailText: string;
  cardDetailButtonBg: string;
  cardDetailButtonText: string;
  cardDetailButtonHoverBg: string;
  cardDetailButtonHoverText: string;
  scrollbarColor: string;
  scrollbarTrackColor: string;
}

export interface BoardThemeDefinition {
  id: string;
  name: string;
  palette: BoardThemePalette;
}

export type BoardBackgroundMode = 'theme' | 'color' | 'image';
export type BoardBackgroundImageScale = 'fill' | 'fit' | 'fit-top-left' | 'smart-fill';

export interface BoardThemeSettings {
  selectedThemeId: string;
  selectedTheme: BoardThemeDefinition;
  customThemes: BoardThemeDefinition[];
  smartContrast: boolean;
  backgroundMode: BoardBackgroundMode;
  backgroundColor?: string | undefined;
  backgroundImageUrl?: string | undefined;
  backgroundImageScale?: BoardBackgroundImageScale | undefined;
  backgroundFocalX?: number | undefined;
  backgroundFocalY?: number | undefined;
  /**
   * Opacity for board chrome surfaces (navbar + lists/cards) when an image background is active.
   * Stored as 0..1. When unset, defaults to 0.8 for image backgrounds.
   */
  boardOpacity?: number | undefined;
}

/** Persisted on boards after theme hydration migration (no embedded theme payloads). */
export interface BoardThemeSettingsStored {
  selectedThemeId: string;
  smartContrast: boolean;
  backgroundMode: BoardBackgroundMode;
  backgroundColor?: string | undefined;
  backgroundImageUrl?: string | undefined;
  backgroundImageScale?: BoardBackgroundImageScale | undefined;
  backgroundFocalX?: number | undefined;
  backgroundFocalY?: number | undefined;
  boardOpacity?: number | undefined;
  /** Legacy embedded fields — migrated to `themes` collection. */
  selectedTheme?: BoardThemeDefinition;
  customThemes?: BoardThemeDefinition[];
}

export { BOARD_DEFAULT_THEME_ID } from './boardThemeSeedData.js';

export const BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA = '#00000000';

export const BOARD_NAVBAR_LIGHT_FG_THEME_IDS = BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS;

export function boardThemePrefersNavbarLightForeground(themeId: string): boolean {
  return BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS.includes(themeId);
}

/** @deprecated Load from `/api/v1/themes` or {@link SYSTEM_BOARD_THEME_SEEDS}. */
export const BOARD_DEFAULT_THEMES = SYSTEM_BOARD_THEME_SEEDS;

export { BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES, SYSTEM_BOARD_THEME_SEEDS };

function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

export function findBoardThemeById(
  themeId: string,
  catalog: BoardThemeCatalog = buildFallbackBoardThemeCatalog(),
): BoardThemeDefinition | null {
  return findBoardThemeInCatalog(themeId, catalog);
}

export function createDefaultBoardThemeSettings(
  themeId?: string,
  catalog: BoardThemeCatalog = buildFallbackBoardThemeCatalog(),
): BoardThemeSettings {
  const preferred = themeId?.trim() ?? '';
  const selectedTheme =
    (preferred !== '' ? findBoardThemeInCatalog(preferred, catalog) : null) ??
    defaultThemeFromCatalog(catalog);
  return {
    selectedThemeId: selectedTheme.id,
    selectedTheme,
    customThemes: [],
    smartContrast: true,
    backgroundMode: 'theme',
    backgroundColor: selectedTheme.palette.canvasBg,
    backgroundImageScale: 'fill',
    backgroundFocalX: 0.5,
    backgroundFocalY: 0.5,
    boardOpacity: 0.8,
  };
}

export function resolveBoardThemeByIdOrCurrent(
  selectedThemeId: string,
  selectedTheme: BoardThemeDefinition,
  customThemes: readonly BoardThemeDefinition[],
  catalog: BoardThemeCatalog = buildFallbackBoardThemeCatalog(),
): BoardThemeDefinition {
  const selectedCustom = customThemes.find((t) => t.id === selectedThemeId);
  if (selectedCustom != null) {
    return cloneTheme(selectedCustom);
  }
  const fromCatalog = findBoardThemeInCatalog(selectedThemeId, catalog);
  if (fromCatalog != null) {
    return fromCatalog;
  }
  return cloneTheme(selectedTheme);
}

function normalizeThemeCandidate(
  candidate: unknown,
  catalog: BoardThemeCatalog,
): BoardThemeDefinition | null {
  if (candidate == null || typeof candidate !== 'object') {
    return null;
  }
  const c = candidate as {
    id?: unknown;
    name?: unknown;
    palette?: Partial<Record<keyof BoardThemePalette, unknown>>;
  };
  if (typeof c.id !== 'string' || c.id.trim() === '' || typeof c.name !== 'string' || c.name.trim() === '') {
    return null;
  }
  const defaultTheme =
    findBoardThemeInCatalog(c.id, catalog) ?? defaultThemeFromCatalog(catalog);
  if (defaultTheme == null) {
    return null;
  }
  const palette: BoardThemePalette = { ...defaultTheme.palette };
  if (c.palette != null) {
    const keys = Object.keys(palette) as Array<keyof BoardThemePalette>;
    for (const key of keys) {
      const next = c.palette[key];
      if (typeof next === 'string' && next.trim() !== '') {
        palette[key] = next.trim();
      }
    }
  }
  return {
    id: c.id.trim(),
    name: c.name.trim(),
    palette,
  };
}

export function normalizeBoardThemeSettings(
  next: unknown,
  prev?: BoardThemeSettings,
  catalog: BoardThemeCatalog = buildFallbackBoardThemeCatalog(),
): BoardThemeSettings {
  const base = prev ?? createDefaultBoardThemeSettings(undefined, catalog);
  if (next == null || typeof next !== 'object') {
    return base;
  }
  const value = next as BoardThemeSettingsStored;
  const customThemesRaw = Array.isArray(value.customThemes) ? value.customThemes : base.customThemes;
  let customThemes = customThemesRaw
    .map((entry) => normalizeThemeCandidate(entry, catalog))
    .filter((entry): entry is BoardThemeDefinition => entry != null);
  const selectedThemeCandidate = normalizeThemeCandidate(value.selectedTheme, catalog);
  const selectedThemeId =
    typeof value.selectedThemeId === 'string' && value.selectedThemeId.trim() !== ''
      ? value.selectedThemeId.trim()
      : selectedThemeCandidate?.id ?? base.selectedThemeId;
  if (
    selectedThemeCandidate != null &&
    selectedThemeCandidate.id === selectedThemeId &&
    findBoardThemeInCatalog(selectedThemeId, catalog) == null
  ) {
    const idx = customThemes.findIndex((t) => t.id === selectedThemeId);
    if (idx >= 0) {
      customThemes = customThemes.slice();
      customThemes[idx] = cloneTheme(selectedThemeCandidate);
    } else {
      customThemes = [...customThemes, cloneTheme(selectedThemeCandidate)];
    }
  }
  const selectedTheme = resolveBoardThemeByIdOrCurrent(
    selectedThemeId,
    selectedThemeCandidate ?? base.selectedTheme,
    customThemes,
    catalog,
  );
  const modeRaw = typeof value.backgroundMode === 'string' ? value.backgroundMode : base.backgroundMode;
  const backgroundMode: BoardBackgroundMode =
    modeRaw === 'color' || modeRaw === 'image' || modeRaw === 'theme' ? modeRaw : 'theme';
  const scaleRaw =
    typeof value.backgroundImageScale === 'string'
      ? value.backgroundImageScale
      : base.backgroundImageScale ?? 'fill';
  const backgroundImageScale: BoardBackgroundImageScale =
    scaleRaw === 'fit' || scaleRaw === 'fit-top-left' || scaleRaw === 'smart-fill' || scaleRaw === 'fill'
      ? scaleRaw
      : 'fill';
  const backgroundFocalXRaw =
    typeof value.backgroundFocalX === 'number' ? value.backgroundFocalX : base.backgroundFocalX ?? 0.5;
  const backgroundFocalYRaw =
    typeof value.backgroundFocalY === 'number' ? value.backgroundFocalY : base.backgroundFocalY ?? 0.5;
  const backgroundFocalX = Number.isFinite(backgroundFocalXRaw)
    ? Math.max(0, Math.min(1, backgroundFocalXRaw))
    : 0.5;
  const backgroundFocalY = Number.isFinite(backgroundFocalYRaw)
    ? Math.max(0, Math.min(1, backgroundFocalYRaw))
    : 0.5;
  const boardOpacityRaw =
    typeof value.boardOpacity === 'number' ? value.boardOpacity : base.boardOpacity ?? 0.8;
  const boardOpacity = Number.isFinite(boardOpacityRaw)
    ? Math.max(0.1, Math.min(1, boardOpacityRaw))
    : 0.8;
  return {
    selectedThemeId: selectedTheme.id,
    selectedTheme,
    customThemes,
    smartContrast: typeof value.smartContrast === 'boolean' ? value.smartContrast : base.smartContrast,
    backgroundMode,
    backgroundImageScale,
    backgroundFocalX,
    backgroundFocalY,
    boardOpacity,
    ...(typeof value.backgroundColor === 'string' && value.backgroundColor.trim() !== ''
      ? { backgroundColor: value.backgroundColor.trim() }
      : base.backgroundColor != null
        ? { backgroundColor: base.backgroundColor }
        : {}),
    ...(typeof value.backgroundImageUrl === 'string' && value.backgroundImageUrl.trim() !== ''
      ? { backgroundImageUrl: value.backgroundImageUrl.trim() }
      : {}),
  };
}

export function dehydrateBoardThemeSettings(settings: BoardThemeSettings): BoardThemeSettingsStored {
  return {
    selectedThemeId: settings.selectedThemeId,
    smartContrast: settings.smartContrast,
    backgroundMode: settings.backgroundMode,
    backgroundImageScale: settings.backgroundImageScale,
    backgroundFocalX: settings.backgroundFocalX,
    backgroundFocalY: settings.backgroundFocalY,
    boardOpacity: settings.boardOpacity,
    ...(settings.backgroundColor != null ? { backgroundColor: settings.backgroundColor } : {}),
    ...(settings.backgroundImageUrl != null ? { backgroundImageUrl: settings.backgroundImageUrl } : {}),
  };
}

export function isSystemBoardTheme(
  themeId: string,
  catalog: BoardThemeCatalog = buildFallbackBoardThemeCatalog(),
): boolean {
  return isSystemBoardThemeId(themeId, catalog);
}

export function resolveBoardBackgroundFromThemeSettings(settings: BoardThemeSettings): string | undefined {
  if (settings.backgroundMode === 'image') {
    const image = settings.backgroundImageUrl?.trim() ?? '';
    if (image !== '') {
      return image;
    }
  }
  if (settings.backgroundMode === 'color') {
    const color = settings.backgroundColor?.trim() ?? '';
    if (color !== '') {
      return color;
    }
  }
  return settings.selectedTheme.palette.canvasBg;
}

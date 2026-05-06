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

export const BOARD_DEFAULT_THEME_ID = 'ocean-blue';

/** Fully transparent 8-digit HEXA for native scrollbar tracks on `.board-page` (`scrollbar-color` second colour). */
export const BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA = '#00000000';

/**
 * Saturated default navbars where white labels are kept for smart contrast. A strict 4.5:1 check
 * would pick dark text on these mid-luminance fills; the board chrome is designed for light nav FG.
 */
export const BOARD_NAVBAR_LIGHT_FG_THEME_IDS: readonly string[] = ['sunset-orange', 'mint-green', 'teal'];

export function boardThemePrefersNavbarLightForeground(themeId: string): boolean {
  return BOARD_NAVBAR_LIGHT_FG_THEME_IDS.includes(themeId);
}

export const BOARD_DEFAULT_THEMES: readonly BoardThemeDefinition[] = [
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    palette: {
      navbarBg: '#1a5b99',
      navbarBorder: '#ffffff1f',
      canvasBg: '#2b82c9',
      listBg: '#ffffff',
      listHeaderText: '#172b4d',
      listMuted: '#5e6c84',
      listMutedStrong: '#42526e',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #0000001f',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff47',
      cardDetailBg: '#f8f9fb',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#868e96',
      cardDetailButtonBg: '#f0f1f4',
      cardDetailButtonText: '#1f2937',
      cardDetailButtonHoverBg: '#e4e6ea',
      cardDetailButtonHoverText: '#1f2937',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    palette: {
      navbarBg: '#be7b12',
      navbarBorder: '#ffffff2e',
      canvasBg: '#d8902b',
      listBg: '#ffffff',
      listHeaderText: '#3b2b12',
      listMuted: '#6c5a40',
      listMutedStrong: '#503d27',
      listControlHoverBg: '#00000012',
      listShadow: '0 1px 3px #00000021',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff4d',
      cardDetailBg: '#fcfaf7',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#866a45',
      cardDetailButtonBg: '#f4efe8',
      cardDetailButtonText: '#3f2c19',
      cardDetailButtonHoverBg: '#eadfce',
      cardDetailButtonHoverText: '#3f2c19',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    palette: {
      navbarBg: '#3f7d24',
      navbarBorder: '#ffffff29',
      canvasBg: '#5fa237',
      listBg: '#ffffff',
      listHeaderText: '#193018',
      listMuted: '#52684f',
      listMutedStrong: '#395139',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #0000001f',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff4d',
      cardDetailBg: '#f7faf7',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#56725a',
      cardDetailButtonBg: '#edf3ed',
      cardDetailButtonText: '#1e3221',
      cardDetailButtonHoverBg: '#dde7dd',
      cardDetailButtonHoverText: '#1e3221',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'ruby-red',
    name: 'Ruby Red',
    palette: {
      navbarBg: '#9d3d2b',
      navbarBorder: '#ffffff2e',
      canvasBg: '#b8503a',
      listBg: '#ffffff',
      listHeaderText: '#3a1f1b',
      listMuted: '#715552',
      listMutedStrong: '#553a37',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #00000021',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff4d',
      cardDetailBg: '#faf7f7',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#7a5e5e',
      cardDetailButtonBg: '#f3ecec',
      cardDetailButtonText: '#3c2323',
      cardDetailButtonHoverBg: '#e7dddd',
      cardDetailButtonHoverText: '#3c2323',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    palette: {
      navbarBg: '#7b5db5',
      navbarBorder: '#ffffff2e',
      canvasBg: '#987ad0',
      listBg: '#ffffff',
      listHeaderText: '#2a2242',
      listMuted: '#625a79',
      listMutedStrong: '#4a4262',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #00000021',
      addListBg: '#ffffff38',
      addListBgHover: '#ffffff4f',
      cardDetailBg: '#f8f7fb',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#676080',
      cardDetailButtonBg: '#efecf7',
      cardDetailButtonText: '#2a2242',
      cardDetailButtonHoverBg: '#e3ddf1',
      cardDetailButtonHoverText: '#2a2242',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'hot-pink',
    name: 'Hot Pink',
    palette: {
      navbarBg: '#c04a97',
      navbarBorder: '#ffffff33',
      canvasBg: '#dc65af',
      listBg: '#ffffff',
      listHeaderText: '#3f1f33',
      listMuted: '#7a5c71',
      listMutedStrong: '#604657',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #00000021',
      addListBg: '#ffffff3b',
      addListBgHover: '#ffffff54',
      cardDetailBg: '#fbf7fa',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#7b6273',
      cardDetailButtonBg: '#f3ecf1',
      cardDetailButtonText: '#3f1f33',
      cardDetailButtonHoverBg: '#e8dde6',
      cardDetailButtonHoverText: '#3f1f33',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'mint-green',
    name: 'Mint Green',
    palette: {
      navbarBg: '#53b972',
      navbarBorder: '#ffffff29',
      canvasBg: '#75cf8f',
      listBg: '#ffffff',
      listHeaderText: '#193226',
      listMuted: '#567666',
      listMutedStrong: '#3f5c4e',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #0000001f',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff4f',
      cardDetailBg: '#f7fbf8',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#5a7568',
      cardDetailButtonBg: '#edf4ef',
      cardDetailButtonText: '#1f3329',
      cardDetailButtonHoverBg: '#dfe9e2',
      cardDetailButtonHoverText: '#1f3329',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    palette: {
      navbarBg: '#2f9abc',
      navbarBorder: '#ffffff2e',
      canvasBg: '#46b3d7',
      listBg: '#ffffff',
      listHeaderText: '#17353e',
      listMuted: '#5a7480',
      listMutedStrong: '#435c66',
      listControlHoverBg: '#0000000f',
      listShadow: '0 1px 3px #0000001f',
      addListBg: '#ffffff33',
      addListBgHover: '#ffffff4d',
      cardDetailBg: '#f7fafb',
      cardDetailTitleText: '#1a1b1e',
      cardDetailText: '#5a717a',
      cardDetailButtonBg: '#edf3f5',
      cardDetailButtonText: '#18323a',
      cardDetailButtonHoverBg: '#dee8eb',
      cardDetailButtonHoverText: '#18323a',
      scrollbarColor: 'unset',
      scrollbarTrackColor: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
    },
  },
] as const;

/**
 * Fixed 8-digit HEXA swatches for board theme `ColorInput` pickers (navbar + canvas only).
 * Order: each entry in {@link BOARD_DEFAULT_THEMES} — `navbarBg`, then `canvasBg`. Update this
 * list when default theme nav/canvas colours change.
 */
export const BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES: readonly string[] = [
  '#1a5b99ff',
  '#2b82c9ff',
  '#be7b12ff',
  '#d8902bff',
  '#3f7d24ff',
  '#5fa237ff',
  '#9d3d2bff',
  '#b8503aff',
  '#7b5db5ff',
  '#987ad0ff',
  '#c04a97ff',
  '#dc65afff',
  '#53b972ff',
  '#75cf8fff',
  '#2f9abcff',
  '#46b3d7ff',
];

function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

export function findBoardThemeById(themeId: string): BoardThemeDefinition | null {
  const trimmed = themeId.trim();
  if (trimmed === '') {
    return null;
  }
  const found = BOARD_DEFAULT_THEMES.find((theme) => theme.id === trimmed);
  return found != null ? cloneTheme(found) : null;
}

export function createDefaultBoardThemeSettings(themeId?: string): BoardThemeSettings {
  const preferred = themeId?.trim() ?? '';
  const selectedTheme =
    (preferred !== '' ? findBoardThemeById(preferred) : null) ??
    findBoardThemeById(BOARD_DEFAULT_THEME_ID) ??
    cloneTheme(BOARD_DEFAULT_THEMES[0]!);
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
): BoardThemeDefinition {
  const selectedCustom = customThemes.find((t) => t.id === selectedThemeId);
  if (selectedCustom != null) {
    return cloneTheme(selectedCustom);
  }
  const defaultTheme = findBoardThemeById(selectedThemeId);
  if (defaultTheme != null) {
    return defaultTheme;
  }
  return cloneTheme(selectedTheme);
}

function normalizeThemeCandidate(candidate: unknown): BoardThemeDefinition | null {
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
  const defaultTheme = findBoardThemeById(c.id) ?? findBoardThemeById(BOARD_DEFAULT_THEME_ID);
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
): BoardThemeSettings {
  const base = prev ?? createDefaultBoardThemeSettings();
  if (next == null || typeof next !== 'object') {
    return base;
  }
  const value = next as {
    selectedThemeId?: unknown;
    selectedTheme?: unknown;
    customThemes?: unknown;
    smartContrast?: unknown;
    backgroundMode?: unknown;
    backgroundColor?: unknown;
    backgroundImageUrl?: unknown;
    backgroundImageScale?: unknown;
    backgroundFocalX?: unknown;
    backgroundFocalY?: unknown;
    boardOpacity?: unknown;
  };
  const customThemesRaw = Array.isArray(value.customThemes) ? value.customThemes : base.customThemes;
  let customThemes = customThemesRaw
    .map((entry) => normalizeThemeCandidate(entry))
    .filter((entry): entry is BoardThemeDefinition => entry != null);
  const selectedThemeCandidate = normalizeThemeCandidate(value.selectedTheme);
  const selectedThemeId =
    typeof value.selectedThemeId === 'string' && value.selectedThemeId.trim() !== ''
      ? value.selectedThemeId.trim()
      : selectedThemeCandidate?.id ?? base.selectedThemeId;
  if (
    selectedThemeCandidate != null &&
    selectedThemeCandidate.id === selectedThemeId &&
    findBoardThemeById(selectedThemeId) == null
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

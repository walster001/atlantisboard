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
export type BoardBackgroundImageScale = 'fill' | 'fit' | 'stretch';

export interface BoardThemeSettings {
  selectedThemeId: string;
  selectedTheme: BoardThemeDefinition;
  customThemes: BoardThemeDefinition[];
  smartContrast: boolean;
  backgroundMode: BoardBackgroundMode;
  backgroundColor?: string | undefined;
  backgroundImageUrl?: string | undefined;
  backgroundImageScale?: BoardBackgroundImageScale | undefined;
}

export const BOARD_DEFAULT_THEME_ID = 'ocean-blue';

export const BOARD_DEFAULT_THEMES: readonly BoardThemeDefinition[] = [
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    palette: {
      navbarBg: '#1a5b99',
      navbarBorder: 'rgba(255, 255, 255, 0.12)',
      canvasBg: '#2b82c9',
      listBg: '#ffffff',
      listHeaderText: '#172b4d',
      listMuted: '#5e6c84',
      listMutedStrong: '#42526e',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.28)',
      cardDetailBg: '#f8f9fb',
      cardDetailText: '#868e96',
      cardDetailButtonBg: '#f0f1f4',
      cardDetailButtonText: '#1f2937',
      cardDetailButtonHoverBg: '#e4e6ea',
      cardDetailButtonHoverText: '#1f2937',
      scrollbarColor: '#495057',
      scrollbarTrackColor: '#ced4da',
    },
  },
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    palette: {
      navbarBg: '#be7b12',
      navbarBorder: 'rgba(255, 255, 255, 0.18)',
      canvasBg: '#d8902b',
      listBg: '#ffffff',
      listHeaderText: '#3b2b12',
      listMuted: '#6c5a40',
      listMutedStrong: '#503d27',
      listControlHoverBg: 'rgba(0, 0, 0, 0.07)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.13)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.3)',
      cardDetailBg: '#fcfaf7',
      cardDetailText: '#866a45',
      cardDetailButtonBg: '#f4efe8',
      cardDetailButtonText: '#3f2c19',
      cardDetailButtonHoverBg: '#eadfce',
      cardDetailButtonHoverText: '#3f2c19',
      scrollbarColor: '#8c5a15',
      scrollbarTrackColor: '#d7b48a',
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    palette: {
      navbarBg: '#3f7d24',
      navbarBorder: 'rgba(255, 255, 255, 0.16)',
      canvasBg: '#5fa237',
      listBg: '#ffffff',
      listHeaderText: '#193018',
      listMuted: '#52684f',
      listMutedStrong: '#395139',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.3)',
      cardDetailBg: '#f7faf7',
      cardDetailText: '#56725a',
      cardDetailButtonBg: '#edf3ed',
      cardDetailButtonText: '#1e3221',
      cardDetailButtonHoverBg: '#dde7dd',
      cardDetailButtonHoverText: '#1e3221',
      scrollbarColor: '#3e6d2e',
      scrollbarTrackColor: '#b7cfb1',
    },
  },
  {
    id: 'ruby-red',
    name: 'Ruby Red',
    palette: {
      navbarBg: '#9d3d2b',
      navbarBorder: 'rgba(255, 255, 255, 0.18)',
      canvasBg: '#b8503a',
      listBg: '#ffffff',
      listHeaderText: '#3a1f1b',
      listMuted: '#715552',
      listMutedStrong: '#553a37',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.13)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.3)',
      cardDetailBg: '#faf7f7',
      cardDetailText: '#7a5e5e',
      cardDetailButtonBg: '#f3ecec',
      cardDetailButtonText: '#3c2323',
      cardDetailButtonHoverBg: '#e7dddd',
      cardDetailButtonHoverText: '#3c2323',
      scrollbarColor: '#7a3529',
      scrollbarTrackColor: '#d4b0a9',
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    palette: {
      navbarBg: '#7b5db5',
      navbarBorder: 'rgba(255, 255, 255, 0.18)',
      canvasBg: '#987ad0',
      listBg: '#ffffff',
      listHeaderText: '#2a2242',
      listMuted: '#625a79',
      listMutedStrong: '#4a4262',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.13)',
      addListBg: 'rgba(255, 255, 255, 0.22)',
      addListBgHover: 'rgba(255, 255, 255, 0.31)',
      cardDetailBg: '#f8f7fb',
      cardDetailText: '#676080',
      cardDetailButtonBg: '#efecf7',
      cardDetailButtonText: '#2a2242',
      cardDetailButtonHoverBg: '#e3ddf1',
      cardDetailButtonHoverText: '#2a2242',
      scrollbarColor: '#644a96',
      scrollbarTrackColor: '#c8bbdf',
    },
  },
  {
    id: 'hot-pink',
    name: 'Hot Pink',
    palette: {
      navbarBg: '#c04a97',
      navbarBorder: 'rgba(255, 255, 255, 0.2)',
      canvasBg: '#dc65af',
      listBg: '#ffffff',
      listHeaderText: '#3f1f33',
      listMuted: '#7a5c71',
      listMutedStrong: '#604657',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.13)',
      addListBg: 'rgba(255, 255, 255, 0.23)',
      addListBgHover: 'rgba(255, 255, 255, 0.33)',
      cardDetailBg: '#fbf7fa',
      cardDetailText: '#7b6273',
      cardDetailButtonBg: '#f3ecf1',
      cardDetailButtonText: '#3f1f33',
      cardDetailButtonHoverBg: '#e8dde6',
      cardDetailButtonHoverText: '#3f1f33',
      scrollbarColor: '#974272',
      scrollbarTrackColor: '#ddb6d0',
    },
  },
  {
    id: 'mint-green',
    name: 'Mint Green',
    palette: {
      navbarBg: '#53b972',
      navbarBorder: 'rgba(255, 255, 255, 0.16)',
      canvasBg: '#75cf8f',
      listBg: '#ffffff',
      listHeaderText: '#193226',
      listMuted: '#567666',
      listMutedStrong: '#3f5c4e',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.31)',
      cardDetailBg: '#f7fbf8',
      cardDetailText: '#5a7568',
      cardDetailButtonBg: '#edf4ef',
      cardDetailButtonText: '#1f3329',
      cardDetailButtonHoverBg: '#dfe9e2',
      cardDetailButtonHoverText: '#1f3329',
      scrollbarColor: '#3f8d57',
      scrollbarTrackColor: '#b8dec2',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    palette: {
      navbarBg: '#2f9abc',
      navbarBorder: 'rgba(255, 255, 255, 0.18)',
      canvasBg: '#46b3d7',
      listBg: '#ffffff',
      listHeaderText: '#17353e',
      listMuted: '#5a7480',
      listMutedStrong: '#435c66',
      listControlHoverBg: 'rgba(0, 0, 0, 0.06)',
      listShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
      addListBg: 'rgba(255, 255, 255, 0.2)',
      addListBgHover: 'rgba(255, 255, 255, 0.3)',
      cardDetailBg: '#f7fafb',
      cardDetailText: '#5a717a',
      cardDetailButtonBg: '#edf3f5',
      cardDetailButtonText: '#18323a',
      cardDetailButtonHoverBg: '#dee8eb',
      cardDetailButtonHoverText: '#18323a',
      scrollbarColor: '#2f768d',
      scrollbarTrackColor: '#b6d4df',
    },
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    palette: {
      navbarBg: '#262626',
      navbarBorder: 'rgba(255, 255, 255, 0.18)',
      canvasBg: '#3a3a3a',
      listBg: '#555555',
      listHeaderText: '#f1f3f5',
      listMuted: '#d0d4db',
      listMutedStrong: '#f1f3f5',
      listControlHoverBg: 'rgba(255, 255, 255, 0.12)',
      listShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
      addListBg: 'rgba(255, 255, 255, 0.16)',
      addListBgHover: 'rgba(255, 255, 255, 0.26)',
      cardDetailBg: '#454545',
      cardDetailText: '#ffffff',
      cardDetailButtonBg: '#000000',
      cardDetailButtonText: '#ffffff',
      cardDetailButtonHoverBg: '#005a8c',
      cardDetailButtonHoverText: '#ffffff',
      scrollbarColor: '#343434',
      scrollbarTrackColor: '#999999',
    },
  },
] as const;

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
  };
  const customThemesRaw = Array.isArray(value.customThemes) ? value.customThemes : base.customThemes;
  const customThemes = customThemesRaw
    .map((entry) => normalizeThemeCandidate(entry))
    .filter((entry): entry is BoardThemeDefinition => entry != null);
  const selectedThemeCandidate = normalizeThemeCandidate(value.selectedTheme);
  const selectedThemeId =
    typeof value.selectedThemeId === 'string' && value.selectedThemeId.trim() !== ''
      ? value.selectedThemeId.trim()
      : selectedThemeCandidate?.id ?? base.selectedThemeId;
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
    scaleRaw === 'fit' || scaleRaw === 'stretch' || scaleRaw === 'fill' ? scaleRaw : 'fill';
  return {
    selectedThemeId: selectedTheme.id,
    selectedTheme,
    customThemes,
    smartContrast: typeof value.smartContrast === 'boolean' ? value.smartContrast : base.smartContrast,
    backgroundMode,
    backgroundImageScale,
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

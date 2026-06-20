import {
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
  type BoardThemeSettingsStored,
} from '../../shared/boardTheme.js';
import {
  buildBoardThemeCatalog,
  buildFallbackBoardThemeCatalog,
  findBoardThemeInCatalog,
  isSystemBoardThemeId,
  type BoardThemeCatalog,
} from '../../shared/boardThemeCatalog.js';
import { SYSTEM_BOARD_THEME_SEEDS } from '../../shared/boardThemeSeedData.js';

const LAST_HYDRATED_SETTINGS = new Map<string, BoardThemeSettings>();
const LAST_HYDRATED_MAX = 64;

let clientCustomThemes: readonly BoardThemeDefinition[] = [];
let clientCatalogLoadPromise: Promise<void> | null = null;

function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

function setRemembered(boardId: string, settings: BoardThemeSettings): void {
  if (LAST_HYDRATED_SETTINGS.size >= LAST_HYDRATED_MAX) {
    LAST_HYDRATED_SETTINGS.clear();
  }
  LAST_HYDRATED_SETTINGS.set(boardId, settings);
}

export function buildClientBoardThemeCatalog(): BoardThemeCatalog {
  return buildBoardThemeCatalog({
    systemThemes: SYSTEM_BOARD_THEME_SEEDS,
    customThemes: clientCustomThemes,
  });
}

/** Sync shared custom themes from `/api/v1/themes` into normalize cache. */
export function setClientCustomBoardThemes(themes: readonly BoardThemeDefinition[]): void {
  clientCustomThemes = themes.map((theme) => cloneTheme(theme));
}

/**
 * Load shared custom themes once for dehydrated socket/API payloads.
 * ponytail: dynamic import avoids api ↔ transform circular init.
 */
export function ensureClientBoardThemeCatalogLoaded(): Promise<void> {
  if (clientCustomThemes.length > 0) {
    return Promise.resolve();
  }
  if (clientCatalogLoadPromise != null) {
    return clientCatalogLoadPromise;
  }
  clientCatalogLoadPromise = import('./api.js')
    .then(({ api }) => api.getThemes())
    .then((response) => {
      setClientCustomBoardThemes(response.customThemes);
    })
    .catch(() => {
      /* offline / unauthenticated — system themes still resolve */
    })
    .finally(() => {
      clientCatalogLoadPromise = null;
    });
  return clientCatalogLoadPromise;
}

export function isBoardThemeSettingsHydrated(settings: BoardThemeSettings): boolean {
  const palette = settings.selectedTheme?.palette;
  return palette != null && typeof palette.navbarBg === 'string' && palette.navbarBg.trim() !== '';
}

/**
 * Dehydrated board payloads only carry `selectedThemeId`. System themes resolve from the seed
 * catalog; custom themes resolve from the shared theme catalog or a prior hydrated snapshot.
 */
export function boardThemeNeedsHydrationMerge(
  raw: BoardThemeSettingsStored,
  catalog: BoardThemeCatalog = buildClientBoardThemeCatalog(),
): boolean {
  if (isBoardThemeSettingsHydrated(raw as BoardThemeSettings)) {
    return false;
  }
  const id = typeof raw.selectedThemeId === 'string' ? raw.selectedThemeId.trim() : '';
  if (id === '') {
    return false;
  }
  return findBoardThemeInCatalog(id, catalog) == null;
}

export function getRememberedBoardThemeSettings(boardId: string): BoardThemeSettings | undefined {
  const id = boardId.trim();
  if (id === '') {
    return undefined;
  }
  return LAST_HYDRATED_SETTINGS.get(id);
}

export function rememberBoardThemeSettings(boardId: string, settings: BoardThemeSettings): void {
  const id = boardId.trim();
  if (id === '' || !isBoardThemeSettingsHydrated(settings)) {
    return;
  }
  setRemembered(id, settings);
}

function ensureSelectedCustomThemeListed(
  settings: BoardThemeSettings,
  catalog: BoardThemeCatalog,
): BoardThemeSettings {
  const selectedId = settings.selectedThemeId.trim();
  if (selectedId === '' || isSystemBoardThemeId(selectedId, catalog)) {
    return settings;
  }
  if (settings.customThemes.some((theme) => theme.id === selectedId)) {
    return settings;
  }
  return {
    ...settings,
    customThemes: [...settings.customThemes, cloneTheme(settings.selectedTheme)],
  };
}

export function normalizeBoardThemeSettingsForClient(
  boardId: string,
  raw: unknown,
  explicitPrev?: BoardThemeSettings,
): BoardThemeSettings {
  const catalog = buildClientBoardThemeCatalog();
  const remembered = getRememberedBoardThemeSettings(boardId);
  const base =
    explicitPrev ??
    remembered ??
    createDefaultBoardThemeSettings(undefined, buildFallbackBoardThemeCatalog());
  const normalized = ensureSelectedCustomThemeListed(
    normalizeBoardThemeSettings(raw, base, catalog),
    catalog,
  );
  if (isBoardThemeSettingsHydrated(normalized)) {
    rememberBoardThemeSettings(boardId, normalized);
  }
  return normalized;
}

/** Normalize a partial `themeSettings` patch instead of replacing a hydrated snapshot with dehydrated DB fields. */
export function normalizeBoardThemeSettingsPatchForClient(
  boardId: string,
  raw: unknown,
  explicitPrev?: BoardThemeSettings,
): BoardThemeSettings {
  return normalizeBoardThemeSettingsForClient(boardId, raw, explicitPrev);
}

export function resetBoardThemeClientNormalizeForTests(): void {
  LAST_HYDRATED_SETTINGS.clear();
  clientCustomThemes = [];
  clientCatalogLoadPromise = null;
}

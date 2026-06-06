import smartcrop from 'smartcrop';
import { api } from '../../utils/api.js';
import { transformBoard } from '../../utils/transform.js';
import { parseBoardApiResponse } from '../../utils/api/boardApiMethods.js';
import {
  BOARD_DEFAULT_THEME_ID,
  createDefaultBoardThemeSettings,
  findBoardThemeById,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import type { BoardThemeCatalog } from '../../../shared/boardThemeCatalog.js';
import {
  buildAddThemeDraft,
  buildEditThemeDraft,
  cloneTheme,
  type BoardBackgroundImageScaleOption,
} from '../../components/board/boardThemeTabHelpers.js';

export function mergeCustomBoardThemes(
  globalThemes: readonly BoardThemeDefinition[],
  boardThemes: readonly BoardThemeDefinition[],
): BoardThemeDefinition[] {
  const next: BoardThemeDefinition[] = [];
  const seen = new Set<string>();
  for (const source of [globalThemes, boardThemes]) {
    for (const theme of source) {
      const id = theme.id.trim();
      if (id === '' || seen.has(id)) {
        continue;
      }
      seen.add(id);
      next.push(cloneTheme(theme));
    }
  }
  return next;
}

export interface LoadedBoardThemeState {
  readonly savedSettings: BoardThemeSettings;
  readonly appCustomThemes: BoardThemeDefinition[];
}

export async function loadBoardThemeState(
  boardId: string,
  catalog: BoardThemeCatalog,
): Promise<LoadedBoardThemeState> {
  const response = await api.getBoard(boardId, { view: 'detail' });
  const board = transformBoard(parseBoardApiResponse(response).board);
  const normalized = normalizeBoardThemeSettings(
    board.themeSettings,
    createDefaultBoardThemeSettings(undefined, catalog),
    catalog,
  );
  const globalThemes = catalog.customThemes.map((theme) => cloneTheme(theme));
  const mergedCustomThemes = mergeCustomBoardThemes(globalThemes, normalized.customThemes);
  const normalizedWithGlobal = normalizeBoardThemeSettings(
    {
      ...normalized,
      customThemes: mergedCustomThemes,
    },
    normalized,
    catalog,
  );
  return {
    savedSettings: normalizedWithGlobal,
    appCustomThemes: mergedCustomThemes,
  };
}

export async function persistBoardThemePatch(
  boardId: string,
  normalized: BoardThemeSettings,
): Promise<BoardThemeSettings> {
  const background = resolveBoardBackgroundFromThemeSettings(normalized);
  await api.updateBoard(boardId, {
    themeSettings: { ...normalized, customThemes: [] },
    ...(background !== undefined ? { background } : {}),
  });
  return normalized;
}

export async function applyThemeSelectionToBoard(args: {
  readonly boardId: string;
  readonly catalog: BoardThemeCatalog;
  readonly previousDraft: BoardThemeSettings;
  readonly themeId: string;
}): Promise<BoardThemeSettings> {
  const { boardId, catalog, previousDraft, themeId } = args;
  const custom = previousDraft.customThemes.find((theme) => theme.id === themeId);
  const selected = custom ?? findBoardThemeById(themeId, catalog) ?? previousDraft.selectedTheme;
  const nextDraft: BoardThemeSettings = {
    ...previousDraft,
    selectedThemeId: selected.id,
    selectedTheme: cloneTheme(selected),
    backgroundColor: selected.palette.canvasBg,
  };
  const normalized = normalizeBoardThemeSettings(nextDraft, previousDraft, catalog);
  return persistBoardThemePatch(boardId, normalized);
}

export async function saveCustomThemeEditor(args: {
  readonly boardId: string;
  readonly catalog: BoardThemeCatalog;
  readonly draft: BoardThemeSettings;
  readonly next: BoardThemeSettings;
  readonly refreshUser: () => Promise<void>;
  readonly reloadThemes: () => void;
}): Promise<{ readonly normalized: BoardThemeSettings; readonly appCustomThemes: BoardThemeDefinition[] }> {
  const { boardId, catalog, draft, next, refreshUser, reloadThemes } = args;
  const normalized = normalizeBoardThemeSettings(next, draft, catalog);
  const nextGlobalThemes = normalized.customThemes.map((theme) => cloneTheme(theme));
  await api.updateUserPreferences({ customBoardThemes: nextGlobalThemes });
  await refreshUser();
  reloadThemes();
  const persisted = await persistBoardThemePatch(boardId, normalized);
  return { normalized: persisted, appCustomThemes: nextGlobalThemes };
}

export function buildThemeEditorInitial(
  variant: 'add' | 'edit',
  draft: BoardThemeSettings,
  themeId?: string,
): BoardThemeSettings {
  return variant === 'add' ? buildAddThemeDraft(draft) : buildEditThemeDraft(draft, themeId ?? '');
}

export async function updateAppWideCustomThemes(
  themes: readonly BoardThemeDefinition[],
  refreshUser: () => Promise<void>,
): Promise<void> {
  await api.updateUserPreferences({ customBoardThemes: themes });
  await refreshUser();
}

export function buildDuplicatedCustomTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  const newId = `custom-${Date.now()}`;
  return {
    id: newId,
    name: `${theme.name.trim()} (copy)`,
    palette: { ...theme.palette },
  };
}

export function applyDeletedCustomThemeToDraft(args: {
  readonly prev: BoardThemeSettings;
  readonly themeId: string;
  readonly catalog: BoardThemeCatalog;
  readonly systemThemes: readonly BoardThemeDefinition[];
}): BoardThemeSettings {
  const { prev, themeId, catalog, systemThemes } = args;
  const nextCustom = prev.customThemes.filter((t) => t.id !== themeId);
  const wasSelected = prev.selectedThemeId === themeId;
  const fallback =
    findBoardThemeById(BOARD_DEFAULT_THEME_ID, catalog) ??
    systemThemes[0] ??
    createDefaultBoardThemeSettings(undefined, catalog).selectedTheme;
  const selectedTheme = wasSelected ? cloneTheme(fallback) : prev.selectedTheme;
  const selectedThemeId = wasSelected ? fallback.id : prev.selectedThemeId;
  const baseNext: BoardThemeSettings = {
    ...prev,
    customThemes: nextCustom,
    selectedThemeId,
    selectedTheme,
  };
  const merged: BoardThemeSettings =
    wasSelected && prev.backgroundMode === 'theme'
      ? { ...baseNext, backgroundColor: selectedTheme.palette.canvasBg }
      : baseNext;
  return normalizeBoardThemeSettings(merged, prev, catalog);
}

export async function computeSmartcropFocal(file: File): Promise<{ readonly x: number; readonly y: number }> {
  let smartFocalX = 0.5;
  let smartFocalY = 0.5;
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const activeObjectUrl = objectUrl;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to read image dimensions'));
      img.src = activeObjectUrl;
    });
    const crop = await smartcrop.crop(image, {
      width: Math.max(1, Math.round(image.width * 0.65)),
      height: Math.max(1, Math.round(image.height * 0.65)),
    });
    const cropCenterX = crop.topCrop.x + crop.topCrop.width / 2;
    const cropCenterY = crop.topCrop.y + crop.topCrop.height / 2;
    smartFocalX = image.width > 0 ? cropCenterX / image.width : 0.5;
    smartFocalY = image.height > 0 ? cropCenterY / image.height : 0.5;
  } catch {
    smartFocalX = 0.5;
    smartFocalY = 0.5;
  } finally {
    if (objectUrl != null) {
      URL.revokeObjectURL(objectUrl);
    }
  }
  return {
    x: Math.max(0, Math.min(1, smartFocalX)),
    y: Math.max(0, Math.min(1, smartFocalY)),
  };
}

export async function uploadBoardBackgroundImageAction(args: {
  readonly boardId: string;
  readonly file: File;
  readonly draft: BoardThemeSettings;
  readonly savedSettings: BoardThemeSettings;
}): Promise<BoardThemeSettings> {
  const { boardId, file, draft, savedSettings } = args;
  const focal = await computeSmartcropFocal(file);
  const response = await api.uploadBoardBackgroundImage(boardId, file, {
    backgroundImageScale: (draft.backgroundImageScale ?? 'fill') as BoardBackgroundImageScaleOption,
    backgroundFocalX: focal.x,
    backgroundFocalY: focal.y,
  });
  const boardPayload = parseBoardApiResponse(response).board;
  const board = transformBoard(boardPayload);
  return normalizeBoardThemeSettings(
    board.themeSettings,
    normalizeBoardThemeSettings(draft, savedSettings),
  );
}

export async function deleteBoardBackgroundImageAction(args: {
  readonly boardId: string;
  readonly draft: BoardThemeSettings;
  readonly savedSettings: BoardThemeSettings;
}): Promise<BoardThemeSettings> {
  const { boardId, draft, savedSettings } = args;
  const response = await api.deleteBoardBackgroundImage(boardId);
  const board = transformBoard(parseBoardApiResponse(response).board);
  return normalizeBoardThemeSettings(
    board.themeSettings,
    normalizeBoardThemeSettings(draft, savedSettings),
  );
}

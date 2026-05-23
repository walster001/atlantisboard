import mongoose, { type Document, type Types } from 'mongoose';
import type { BoardThemeDefinition, BoardThemeSettings, BoardThemeSettingsStored } from '../../shared/boardTheme.js';
import type { BoardSummaryDTO } from '../../shared/types/viewModels.js';
import type { IBoard } from '../models/Board.js';
import {
  buildBoardThemeCatalog,
  type BoardThemeCatalog,
} from '../../shared/boardThemeCatalog.js';
import {
  BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS,
  SYSTEM_BOARD_THEME_SEEDS,
} from '../../shared/boardThemeSeedData.js';
import {
  createDefaultBoardThemeSettings,
  dehydrateBoardThemeSettings,
  normalizeBoardThemeSettings,
} from '../../shared/boardTheme.js';
import { Board } from '../models/Board.js';
import { BoardTheme, type IBoardTheme } from '../models/BoardTheme.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

let systemCatalogCache: BoardThemeCatalog | null = null;
let systemCatalogLoadedAt = 0;
const SYSTEM_CATALOG_TTL_MS = 60_000;

export function boardThemeDocToDefinition(doc: Pick<IBoardTheme, 'slug' | 'name' | 'palette'>): BoardThemeDefinition {
  return {
    id: doc.slug,
    name: doc.name,
    palette: { ...doc.palette },
  };
}

export async function seedSystemBoardThemes(): Promise<number> {
  let upserted = 0;
  for (const [index, theme] of SYSTEM_BOARD_THEME_SEEDS.entries()) {
    await BoardTheme.updateOne(
      { scope: 'system', slug: theme.id },
      {
        $set: {
          name: theme.name,
          palette: theme.palette,
          sortOrder: index,
          prefersNavbarLightForeground: BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS.includes(theme.id),
        },
        $setOnInsert: { scope: 'system', slug: theme.id },
      },
      { upsert: true },
    );
    upserted += 1;
  }
  systemCatalogCache = null;
  logger.info({ count: upserted }, 'System board themes seeded');
  return upserted;
}

async function upsertCustomTheme(params: {
  readonly scope: 'user' | 'board';
  readonly slug: string;
  readonly name: string;
  readonly palette: BoardThemeDefinition['palette'];
  readonly ownerUserId: Types.ObjectId;
  readonly boardId?: Types.ObjectId;
}): Promise<void> {
  if (params.scope === 'board' && params.boardId == null) {
    throw new Error('boardId is required for board-scoped themes');
  }
  const filter =
    params.scope === 'user'
      ? { scope: 'user' as const, ownerUserId: params.ownerUserId, slug: params.slug }
      : { scope: 'board' as const, boardId: params.boardId!, slug: params.slug };
  await BoardTheme.updateOne(
    filter,
    {
      $set: {
        name: params.name,
        palette: params.palette,
        prefersNavbarLightForeground: false,
      },
      $setOnInsert: {
        scope: params.scope,
        slug: params.slug,
        ownerUserId: params.ownerUserId,
        ...(params.boardId != null ? { boardId: params.boardId } : {}),
      },
    },
    { upsert: true },
  );
}

export async function migrateEmbeddedBoardThemesToCollection(): Promise<{
  readonly userThemes: number;
  readonly boardThemes: number;
  readonly boardsDehydrated: number;
}> {
  let userThemes = 0;
  let boardThemes = 0;
  let boardsDehydrated = 0;

  const users = await User.find({
    'preferences.customBoardThemes.0': { $exists: true },
  })
    .select('_id preferences.customBoardThemes')
    .lean();

  for (const user of users) {
    const themes = user.preferences?.customBoardThemes ?? [];
    const ownerUserId = user._id;
    for (const theme of themes) {
      if (typeof theme.id !== 'string' || theme.id.trim() === '') {
        continue;
      }
      await upsertCustomTheme({
        scope: 'user',
        slug: theme.id.trim(),
        name: theme.name,
        palette: theme.palette,
        ownerUserId,
      });
      userThemes += 1;
    }
    await User.updateOne({ _id: ownerUserId }, { $unset: { 'preferences.customBoardThemes': '' } });
  }

  const boards = await Board.find({
    $or: [
      { 'themeSettings.customThemes.0': { $exists: true } },
      { 'themeSettings.selectedTheme': { $exists: true } },
    ],
  })
    .select('_id ownerId themeSettings')
    .lean();

  for (const board of boards) {
    const raw = board.themeSettings as BoardThemeSettings | BoardThemeSettingsStored | undefined;
    if (raw == null) {
      continue;
    }
    const ownerUserId = board.ownerId;
    const boardOid = board._id;
    const embeddedCustom = Array.isArray(raw.customThemes) ? raw.customThemes : [];
    for (const theme of embeddedCustom) {
      if (typeof theme.id !== 'string' || theme.id.trim() === '') {
        continue;
      }
      await upsertCustomTheme({
        scope: 'board',
        slug: theme.id.trim(),
        name: theme.name,
        palette: theme.palette,
        ownerUserId,
        boardId: boardOid,
      });
      boardThemes += 1;
    }
    const selected = raw.selectedTheme;
    if (
      selected != null &&
      typeof selected.id === 'string' &&
      selected.id.trim() !== '' &&
      !SYSTEM_BOARD_THEME_SEEDS.some((t) => t.id === selected.id) &&
      !embeddedCustom.some((t) => t.id === selected.id)
    ) {
      await upsertCustomTheme({
        scope: 'board',
        slug: selected.id.trim(),
        name: selected.name,
        palette: selected.palette,
        ownerUserId,
        boardId: boardOid,
      });
      boardThemes += 1;
    }

    const catalog = await loadThemeCatalogForContext(ownerUserId.toString(), boardOid.toString());
    const hydrated = normalizeBoardThemeSettings(raw, undefined, catalog);
    const dehydrated = dehydrateBoardThemeSettings(hydrated);
    await Board.updateOne({ _id: boardOid }, { $set: { themeSettings: dehydrated } });
    boardsDehydrated += 1;
  }

  if (userThemes > 0 || boardThemes > 0 || boardsDehydrated > 0) {
    logger.info({ userThemes, boardThemes, boardsDehydrated }, 'Migrated embedded board themes to themes collection');
  }
  return { userThemes, boardThemes, boardsDehydrated };
}

export async function initializeBoardThemes(): Promise<void> {
  await seedSystemBoardThemes();
  await migrateEmbeddedBoardThemesToCollection();
}

export async function loadSystemThemeCatalog(): Promise<BoardThemeCatalog> {
  const now = Date.now();
  if (systemCatalogCache != null && now - systemCatalogLoadedAt < SYSTEM_CATALOG_TTL_MS) {
    return systemCatalogCache;
  }
  const docs = await BoardTheme.find({ scope: 'system' }).sort({ sortOrder: 1, slug: 1 }).lean();
  if (docs.length === 0) {
    await seedSystemBoardThemes();
    return loadSystemThemeCatalog();
  }
  systemCatalogCache = buildBoardThemeCatalog({
    systemThemes: docs.map(boardThemeDocToDefinition),
    customThemes: [],
  });
  systemCatalogLoadedAt = now;
  return systemCatalogCache;
}

export async function loadThemeCatalogForContext(
  userId: string,
  boardId?: string,
): Promise<BoardThemeCatalog> {
  const system = await loadSystemThemeCatalog();
  const or: Record<string, unknown>[] = [{ scope: 'user', ownerUserId: new mongoose.Types.ObjectId(userId) }];
  if (boardId != null && mongoose.Types.ObjectId.isValid(boardId)) {
    or.push({ scope: 'board', boardId: new mongoose.Types.ObjectId(boardId) });
  }
  const customDocs = await BoardTheme.find({ $or: or }).sort({ name: 1, slug: 1 }).lean();
  return buildBoardThemeCatalog({
    systemThemes: system.systemThemes,
    customThemes: customDocs.map(boardThemeDocToDefinition),
  });
}

export async function listThemesForUser(
  userId: string,
  boardId?: string,
): Promise<readonly BoardThemeDefinition[]> {
  const catalog = await loadThemeCatalogForContext(userId, boardId);
  return [...catalog.systemThemes, ...catalog.customThemes];
}

export async function hydrateBoardThemeSettings(
  stored: unknown,
  userId: string,
  boardId?: string,
): Promise<BoardThemeSettings> {
  const catalog = await loadThemeCatalogForContext(userId, boardId);
  return normalizeBoardThemeSettings(stored, createDefaultBoardThemeSettings(undefined, catalog), catalog);
}

export async function persistBoardThemeSettings(params: {
  readonly userId: string;
  readonly boardId: string;
  readonly settings: BoardThemeSettings;
}): Promise<{ readonly hydrated: BoardThemeSettings; readonly stored: BoardThemeSettingsStored }> {
  const boardOid = new mongoose.Types.ObjectId(params.boardId);
  const ownerOid = new mongoose.Types.ObjectId(params.userId);
  const catalog = await loadThemeCatalogForContext(params.userId, params.boardId);
  const normalized = normalizeBoardThemeSettings(params.settings, undefined, catalog);

  for (const theme of normalized.customThemes) {
    if (catalog.systemThemes.some((entry) => entry.id === theme.id)) {
      continue;
    }
    const existingUser = await BoardTheme.exists({
      scope: 'user',
      ownerUserId: ownerOid,
      slug: theme.id,
    });
    if (existingUser != null) {
      continue;
    }
    await upsertCustomTheme({
      scope: 'board',
      slug: theme.id,
      name: theme.name,
      palette: theme.palette,
      ownerUserId: ownerOid,
      boardId: boardOid,
    });
  }

  const refreshedCatalog = await loadThemeCatalogForContext(params.userId, params.boardId);
  const hydrated = normalizeBoardThemeSettings(normalized, undefined, refreshedCatalog);
  const stored = dehydrateBoardThemeSettings(hydrated);
  return { hydrated, stored };
}

export async function replaceUserCustomThemes(
  userId: string,
  themes: readonly BoardThemeDefinition[],
): Promise<void> {
  const ownerOid = new mongoose.Types.ObjectId(userId);
  await BoardTheme.deleteMany({ scope: 'user', ownerUserId: ownerOid });
  for (const theme of themes) {
    await upsertCustomTheme({
      scope: 'user',
      slug: theme.id,
      name: theme.name,
      palette: theme.palette,
      ownerUserId: ownerOid,
    });
  }
}

export async function getUserCustomThemes(userId: string): Promise<readonly BoardThemeDefinition[]> {
  const docs = await BoardTheme.find({ scope: 'user', ownerUserId: new mongoose.Types.ObjectId(userId) })
    .sort({ name: 1, slug: 1 })
    .lean();
  return docs.map(boardThemeDocToDefinition);
}

export async function attachHydratedThemeSettingsToBoard<T extends { themeSettings?: unknown }>(
  board: T,
  userId: string,
  boardId: string,
): Promise<T & { themeSettings?: BoardThemeSettings }> {
  if (board.themeSettings == null) {
    return board as T & { themeSettings?: BoardThemeSettings };
  }
  const themeSettings = await hydrateBoardThemeSettings(board.themeSettings, userId, boardId);
  return { ...board, themeSettings };
}

export async function hydrateBoardDocumentForUser(
  board: Document & IBoard,
  userId: string,
): Promise<Document & IBoard> {
  if (board.themeSettings != null) {
    const themeSettings = await hydrateBoardThemeSettings(
      board.themeSettings,
      userId,
      board._id.toString(),
    );
    board.set('themeSettings', themeSettings);
  }
  return board;
}

export async function hydrateBoardSummaryForUser(
  summary: BoardSummaryDTO,
  userId: string,
): Promise<BoardSummaryDTO> {
  if (summary.themeSettings == null) {
    return summary;
  }
  const themeSettings = await hydrateBoardThemeSettings(summary.themeSettings, userId, summary.id);
  return { ...summary, themeSettings };
}

export async function attachCustomBoardThemesToPreferences<T extends Record<string, unknown>>(
  userId: string,
  preferences: T,
): Promise<T & { customBoardThemes: readonly BoardThemeDefinition[] }> {
  const customBoardThemes = await getUserCustomThemes(userId);
  return { ...preferences, customBoardThemes };
}

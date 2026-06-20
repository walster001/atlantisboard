import { type Document } from 'mongoose';
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

let sharedCatalogCache: BoardThemeCatalog | null = null;
let sharedCatalogLoadedAt = 0;
const SHARED_CATALOG_TTL_MS = 60_000;

const SYSTEM_THEME_SEED_SLUGS = new Set(SYSTEM_BOARD_THEME_SEEDS.map((theme) => theme.id));

function invalidateSharedThemeCatalogCache(): void {
  sharedCatalogCache = null;
}

function isSystemSeedThemeSlug(slug: string): boolean {
  return SYSTEM_THEME_SEED_SLUGS.has(slug.trim());
}

export function boardThemeDocToDefinition(doc: Pick<IBoardTheme, 'slug' | 'name' | 'palette'>): BoardThemeDefinition {
  return {
    id: doc.slug,
    name: doc.name,
    palette: { ...doc.palette },
  };
}

export async function seedSystemBoardThemes(): Promise<number> {
  const bulkOps: Parameters<typeof BoardTheme.bulkWrite>[0] = SYSTEM_BOARD_THEME_SEEDS.map((theme, index) => ({
    updateOne: {
      filter: { scope: 'system' as const, slug: theme.id },
      update: {
        $set: {
          name: theme.name,
          palette: theme.palette,
          sortOrder: index,
          prefersNavbarLightForeground: BOARD_NAVBAR_LIGHT_FG_THEME_SLUGS.includes(theme.id),
        },
        $setOnInsert: { scope: 'system' as const, slug: theme.id },
      },
      upsert: true,
    },
  }));
  if (bulkOps.length > 0) {
    await BoardTheme.bulkWrite(bulkOps, { ordered: false });
  }
  const upserted = bulkOps.length;
  invalidateSharedThemeCatalogCache();
  logger.info({ count: upserted }, 'System board themes seeded');
  return upserted;
}

/** Shared custom themes live in the system catalog (`scope: 'system'`, non-seed slug). */
async function upsertSharedCustomTheme(params: {
  readonly slug: string;
  readonly name: string;
  readonly palette: BoardThemeDefinition['palette'];
}): Promise<void> {
  const slug = params.slug.trim();
  if (slug === '' || isSystemSeedThemeSlug(slug)) {
    return;
  }
  await BoardTheme.updateOne(
    { scope: 'system', slug },
    {
      $set: {
        name: params.name,
        palette: params.palette,
        prefersNavbarLightForeground: false,
      },
      $setOnInsert: { scope: 'system', slug, sortOrder: 1000 },
    },
    { upsert: true },
  );
  invalidateSharedThemeCatalogCache();
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
      await upsertSharedCustomTheme({
        slug: theme.id.trim(),
        name: theme.name,
        palette: theme.palette,
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
    const embeddedCustom = Array.isArray(raw.customThemes) ? raw.customThemes : [];
    for (const theme of embeddedCustom) {
      if (typeof theme.id !== 'string' || theme.id.trim() === '') {
        continue;
      }
      await upsertSharedCustomTheme({
        slug: theme.id.trim(),
        name: theme.name,
        palette: theme.palette,
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
      await upsertSharedCustomTheme({
        slug: selected.id.trim(),
        name: selected.name,
        palette: selected.palette,
      });
      boardThemes += 1;
    }

    const catalog = await loadSharedThemeCatalog();
    const hydrated = normalizeBoardThemeSettings(raw, undefined, catalog);
    const dehydrated = dehydrateBoardThemeSettings(hydrated);
    await Board.updateOne({ _id: board._id }, { $set: { themeSettings: dehydrated } });
    boardsDehydrated += 1;
  }

  if (userThemes > 0 || boardThemes > 0 || boardsDehydrated > 0) {
    logger.info({ userThemes, boardThemes, boardsDehydrated }, 'Migrated embedded board themes to themes collection');
  }
  return { userThemes, boardThemes, boardsDehydrated };
}

/**
 * Converts legacy `scope: 'board'` theme records into the shared system catalog.
 */
async function migrateBoardScopedThemesToShared(): Promise<number> {
  const boardScoped = await BoardTheme.collection.find({ scope: 'board' }).toArray();
  if (boardScoped.length === 0) {
    return 0;
  }
  let converted = 0;
  for (const theme of boardScoped) {
    const slug = typeof theme.slug === 'string' ? theme.slug.trim() : '';
    if (slug === '' || isSystemSeedThemeSlug(slug)) {
      await BoardTheme.collection.deleteOne({ _id: theme._id });
      converted += 1;
      continue;
    }
    await upsertSharedCustomTheme({
      slug,
      name: typeof theme.name === 'string' ? theme.name : slug,
      palette: theme.palette as BoardThemeDefinition['palette'],
    });
    await BoardTheme.collection.deleteOne({ _id: theme._id });
    converted += 1;
  }
  logger.info({ count: converted }, 'Migrated board-scoped themes to shared catalog');
  return converted;
}

/** Promotes user-scoped custom themes into the shared system catalog (one-time). */
async function migrateUserScopedThemesToShared(): Promise<number> {
  const userScoped = await BoardTheme.find({ scope: 'user' }).lean();
  if (userScoped.length === 0) {
    return 0;
  }
  let converted = 0;
  for (const theme of userScoped) {
    const slug = theme.slug.trim();
    if (slug === '' || isSystemSeedThemeSlug(slug)) {
      await BoardTheme.collection.deleteOne({ _id: theme._id });
      converted += 1;
      continue;
    }
    await upsertSharedCustomTheme({
      slug,
      name: theme.name,
      palette: theme.palette,
    });
    await BoardTheme.collection.deleteOne({ _id: theme._id });
    converted += 1;
  }
  logger.info({ count: converted }, 'Migrated user-scoped themes to shared catalog');
  return converted;
}

export async function initializeBoardThemes(): Promise<void> {
  await seedSystemBoardThemes();
  await migrateEmbeddedBoardThemesToCollection();
  await migrateBoardScopedThemesToShared();
  await migrateUserScopedThemesToShared();
}

function splitSystemCatalogDocs(
  docs: readonly Pick<IBoardTheme, 'slug' | 'name' | 'palette' | 'sortOrder'>[],
): BoardThemeCatalog {
  const seedDocs = docs.filter((doc) => isSystemSeedThemeSlug(doc.slug));
  const customDocs = docs.filter((doc) => !isSystemSeedThemeSlug(doc.slug));
  return buildBoardThemeCatalog({
    systemThemes: seedDocs.map(boardThemeDocToDefinition),
    customThemes: customDocs.map(boardThemeDocToDefinition),
  });
}

/** Shared catalog: seeded system themes plus app-wide custom themes (`scope: 'system'`). */
export async function loadSharedThemeCatalog(): Promise<BoardThemeCatalog> {
  const now = Date.now();
  if (sharedCatalogCache != null && now - sharedCatalogLoadedAt < SHARED_CATALOG_TTL_MS) {
    return sharedCatalogCache;
  }
  const docs = await BoardTheme.find({ scope: 'system' }).sort({ sortOrder: 1, slug: 1 }).lean();
  if (docs.length === 0) {
    await seedSystemBoardThemes();
    return loadSharedThemeCatalog();
  }
  sharedCatalogCache = splitSystemCatalogDocs(docs);
  sharedCatalogLoadedAt = now;
  return sharedCatalogCache;
}

/** @deprecated Alias for {@link loadSharedThemeCatalog}. */
export async function loadSystemThemeCatalog(): Promise<BoardThemeCatalog> {
  return loadSharedThemeCatalog();
}

export async function loadThemeCatalogForContext(
  _userId?: string,
): Promise<BoardThemeCatalog> {
  return loadSharedThemeCatalog();
}

export async function listThemesForUser(
  _userId?: string,
): Promise<readonly BoardThemeDefinition[]> {
  const catalog = await loadSharedThemeCatalog();
  return [...catalog.systemThemes, ...catalog.customThemes];
}

export async function hydrateBoardThemeSettings(
  stored: unknown,
  _catalogUserId?: string,
): Promise<BoardThemeSettings> {
  const catalog = await loadSharedThemeCatalog();
  return normalizeBoardThemeSettings(stored, createDefaultBoardThemeSettings(undefined, catalog), catalog);
}

export async function persistBoardThemeSettings(params: {
  readonly userId: string;
  readonly settings: BoardThemeSettings;
}): Promise<{ readonly hydrated: BoardThemeSettings; readonly stored: BoardThemeSettingsStored }> {
  const catalog = await loadSharedThemeCatalog();
  const normalized = normalizeBoardThemeSettings(params.settings, undefined, catalog);

  for (const theme of normalized.customThemes) {
    if (isSystemSeedThemeSlug(theme.id)) {
      continue;
    }
    await upsertSharedCustomTheme({
      slug: theme.id,
      name: theme.name,
      palette: theme.palette,
    });
  }

  const refreshedCatalog = await loadSharedThemeCatalog();
  const hydrated = normalizeBoardThemeSettings(normalized, undefined, refreshedCatalog);
  const stored = dehydrateBoardThemeSettings(hydrated);
  return { hydrated, stored };
}

export async function replaceSharedCustomThemes(
  themes: readonly BoardThemeDefinition[],
): Promise<void> {
  const keepSlugs = new Set(
    themes
      .map((theme) => theme.id.trim())
      .filter((slug) => slug !== '' && !isSystemSeedThemeSlug(slug)),
  );
  const seedSlugs = [...SYSTEM_THEME_SEED_SLUGS];
  await BoardTheme.deleteMany({
    scope: 'system',
    slug: { $nin: [...seedSlugs, ...keepSlugs] },
  });
  for (const theme of themes) {
    await upsertSharedCustomTheme({
      slug: theme.id,
      name: theme.name,
      palette: theme.palette,
    });
  }
  invalidateSharedThemeCatalogCache();
}

/** @deprecated Writes to the shared catalog; `userId` is ignored. */
export async function replaceUserCustomThemes(
  _userId: string,
  themes: readonly BoardThemeDefinition[],
): Promise<void> {
  await replaceSharedCustomThemes(themes);
}

export async function getSharedCustomThemes(): Promise<readonly BoardThemeDefinition[]> {
  const catalog = await loadSharedThemeCatalog();
  return catalog.customThemes;
}

/** @deprecated Returns shared custom themes; `userId` is ignored. */
export async function getUserCustomThemes(_userId: string): Promise<readonly BoardThemeDefinition[]> {
  return getSharedCustomThemes();
}

export async function attachHydratedThemeSettingsToBoard<T extends { themeSettings?: unknown; ownerId: string }>(
  board: T,
): Promise<T & { themeSettings?: BoardThemeSettings }> {
  if (board.themeSettings == null) {
    return board as T & { themeSettings?: BoardThemeSettings };
  }
  const themeSettings = await hydrateBoardThemeSettings(board.themeSettings);
  return { ...board, themeSettings };
}

export async function hydrateBoardDocumentForUser(
  board: Document & IBoard,
  _viewerUserId: string,
): Promise<Document & IBoard> {
  if (board.themeSettings != null) {
    const themeSettings = await hydrateBoardThemeSettings(board.themeSettings);
    board.set('themeSettings', themeSettings);
  }
  return board;
}

export async function hydrateBoardSummaryForUser(
  summary: BoardSummaryDTO,
  _viewerUserId: string,
): Promise<BoardSummaryDTO> {
  if (summary.themeSettings == null) {
    return summary;
  }
  const themeSettings = await hydrateBoardThemeSettings(summary.themeSettings);
  return { ...summary, themeSettings };
}

function isMongooseSubdocument<T extends Record<string, unknown>>(
  value: T,
): value is T & { toObject: () => T } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof (value as { toObject?: () => T }).toObject === 'function'
  );
}

function preferencesToPlainObject<T extends Record<string, unknown>>(preferences: T): T {
  if (isMongooseSubdocument(preferences)) {
    return preferences.toObject();
  }
  return preferences;
}

export async function attachCustomBoardThemesToPreferences<T extends Record<string, unknown>>(
  _userId: string,
  preferences: T,
): Promise<T & { customBoardThemes: readonly BoardThemeDefinition[] }> {
  const customBoardThemes = await getSharedCustomThemes();
  /**
   * `preferences` can be a Mongoose subdocument. Spreading a subdocument is unreliable (fields may
   * not be enumerable), which can cause preference keys like `homeWorkspaceOrder` to disappear
   * from API responses after reload.
   */
  const plain = preferencesToPlainObject(preferences);
  return { ...plain, customBoardThemes };
}

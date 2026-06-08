import multer from 'multer';
import { z } from 'zod';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
} from '../../../shared/constants/entityTextLimits.js';

const boardThemePaletteSchema = z.object({
  navbarBg: z.string().min(1),
  navbarBorder: z.string().min(1),
  canvasBg: z.string().min(1),
  listBg: z.string().min(1),
  listHeaderText: z.string().min(1),
  listMuted: z.string().min(1),
  listMutedStrong: z.string().min(1),
  listControlHoverBg: z.string().min(1),
  listShadow: z.string().min(1),
  addListBg: z.string().min(1),
  addListBgHover: z.string().min(1),
  cardDetailBg: z.string().min(1),
  cardDetailTitleText: z.string().min(1),
  cardDetailText: z.string().min(1),
  cardDetailButtonBg: z.string().min(1),
  cardDetailButtonText: z.string().min(1),
  cardDetailButtonHoverBg: z.string().min(1),
  cardDetailButtonHoverText: z.string().min(1),
  scrollbarColor: z.string().min(1),
  scrollbarTrackColor: z.string().min(1),
});

const boardThemeDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  palette: boardThemePaletteSchema,
});

const boardThemeSettingsSchema = z.object({
  selectedThemeId: z.string().min(1).max(80),
  selectedTheme: boardThemeDefinitionSchema,
  customThemes: z.array(boardThemeDefinitionSchema),
  smartContrast: z.boolean(),
  backgroundMode: z.enum(['theme', 'color', 'image']),
  backgroundColor: z.string().min(1).max(64).optional(),
  backgroundImageUrl: z.string().min(1).max(500_000).optional(),
  backgroundImageScale: z.enum(['fill', 'fit', 'fit-top-left', 'smart-fill']).optional(),
  backgroundFocalX: z.number().min(0).max(1).optional(),
  backgroundFocalY: z.number().min(0).max(1).optional(),
  boardOpacity: z.number().min(0.1).max(1).optional(),
});

export const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(BOARD_NAME_MAX_LENGTH),
  description: z.string().max(BOARD_DESCRIPTION_MAX_LENGTH).optional(),
  background: z.string().optional(),
  themeSettings: boardThemeSettingsSchema.optional(),
  visibility: z.enum(['private', 'workspace', 'public']).optional(),
});

export const updateBoardSchema = z.object({
  workspaceId: z.string().nullable().optional(),
  name: z.string().min(1).max(BOARD_NAME_MAX_LENGTH).optional(),
  description: z.string().max(BOARD_DESCRIPTION_MAX_LENGTH).optional(),
  background: z.string().optional(),
  themeSettings: boardThemeSettingsSchema.optional(),
  visibility: z.enum(['private', 'workspace', 'public']).optional(),
  settings: z
    .object({
      allowComments: z.boolean().optional(),
      allowAttachments: z.boolean().optional(),
      cardCoverImages: z.boolean().optional(),
      showDueDateAndReminders: z.boolean().optional(),
      showRemindersOnCards: z.boolean().optional(),
      showStartDateOnCards: z.boolean().optional(),
      showDueDateOnCards: z.boolean().optional(),
      showEndDateOnCards: z.boolean().optional(),
      showLabels: z.boolean().optional(),
      showAssignees: z.boolean().optional(),
      showChecklist: z.boolean().optional(),
      showAttachments: z.boolean().optional(),
      showComments: z.boolean().optional(),
      showListCardCount: z.boolean().optional(),
      showCardDescriptionPreview: z.boolean().optional(),
      listMaxCards: z.number().min(1).max(100000).optional(),
      listEnforceMaxCards: z.boolean().optional(),
      listColumnWidthAuto: z.boolean().optional(),
      listColumnWidthPx: z.number().min(140).max(800).optional(),
      memberActivityLogRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    })
    .optional(),
});

export const reorderBoardsSchema = z.object({
  workspaceId: z.string().min(1).transform((s) => s.trim()),
  orderedBoardIds: z
    .array(z.string().min(1).transform((s) => s.trim()))
    .min(1),
});

export const boardViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const boardSnapshotQuerySchema = z.object({
  listLimit: z.coerce.number().int().min(1).max(500).optional(),
});

function parseCardIdsQueryParam(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
      .map((id) => id.trim())
      .filter((id) => id !== '');
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

export const cardDescriptionsBatchQuerySchema = z.object({
  cardIds: z.preprocess(
    parseCardIdsQueryParam,
    z.array(z.string().min(1)).min(1).max(200),
  ),
});

export const bulkListColorBodySchema = z.object({
  color: z.string().max(64),
});

export const bulkCardColorBodySchema = z.object({
  color: z.string().max(64),
  listId: z.string().min(1).optional(),
});

export const boardMembersQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['displayName:asc', 'displayName:desc', 'email:asc', 'email:desc']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const boardBackgroundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

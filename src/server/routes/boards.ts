import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import {
  createBoard,
  getBoardById,
  getUserBoards,
  getBoardsByWorkspace,
  updateBoard,
  reorderBoardsInHomeScope,
  getBoardKanbanSnapshotForUser,
  getBoardMembersPage,
  addBoardMember,
  removeBoardMember,
  updateBoardMemberRole,
  deleteBoard,
} from '../services/boardService.js';
import { User } from '../models/User.js';
import { hasPermission } from '../utils/permissions.js';
import { RoleDefinition } from '../models/RoleDefinition.js';
import { Board } from '../models/Board.js';
import { Workspace } from '../models/Workspace.js';
import {
  type BoardMemberRoleUpdateModeKey,
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
  isBuiltInRoleKey,
  isValidCustomRoleKey,
} from '../services/roleService.js';
import { bulkUpdateListColorsForBoard } from '../services/listService.js';
import {
  bulkUpdateCardColorsForBoard,
  getCardDescriptionFieldsBatchForBoard,
} from '../services/cardService.js';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
} from '../../shared/constants/entityTextLimits.js';
import { normalizeBoardThemeSettings } from '../../shared/boardTheme.js';
import {
  deleteBoardBackgroundByPublicUrl,
  uploadBoardBackgroundAsset,
} from '../services/boardBackgroundService.js';
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
  backgroundImageScale: z.enum(['fill', 'fit', 'stretch']).optional(),
});

const router = Router();
const boardBackgroundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function resolveBoardRoleUpdateModeForActor(
  userId: string,
  boardId: string,
): Promise<BoardMemberRoleUpdateModeKey | null> {
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.any')) {
    return 'boards.members.role.update.any';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samehigher')) {
    return 'boards.members.role.update.samehigher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.samelower')) {
    return 'boards.members.role.update.samelower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.higher')) {
    return 'boards.members.role.update.higher';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.lower')) {
    return 'boards.members.role.update.lower';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update.same')) {
    return 'boards.members.role.update.same';
  }
  if (await hasPermission({ id: userId }, boardId, 'boards.members.role.update')) {
    return 'boards.members.role.update.samelower';
  }
  return null;
}

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(BOARD_NAME_MAX_LENGTH),
  description: z.string().max(BOARD_DESCRIPTION_MAX_LENGTH).optional(),
  background: z.string().optional(),
  themeSettings: boardThemeSettingsSchema.optional(),
  visibility: z.enum(['private', 'workspace', 'public']).optional(),
});

const updateBoardSchema = z.object({
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

const reorderBoardsSchema = z.object({
  workspaceId: z.string().min(1).transform((s) => s.trim()),
  orderedBoardIds: z
    .array(z.string().min(1).transform((s) => s.trim()))
    .min(1),
});

const boardViewQuerySchema = z.object({
  view: z.enum(['summary', 'detail']).optional(),
  fields: z.string().optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const cardDescriptionsBatchBodySchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(200),
});

const bulkListColorBodySchema = z.object({
  color: z.string().max(64),
});

const bulkCardColorBodySchema = z.object({
  color: z.string().max(64),
  listId: z.string().min(1).optional(),
});
function selectFields(items: unknown[], fieldsCsv: string | undefined): unknown[] {
  if (fieldsCsv === undefined || fieldsCsv.trim() === '') {
    return items;
  }
  const fields = fieldsCsv
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '');
  if (fields.length === 0) {
    return items;
  }
  return items.map((item) => {
    if (item == null || typeof item !== 'object') {
      return item;
    }
    const obj = item as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in obj) {
        selected[field] = obj[field];
      }
    }
    if ('id' in obj) {
      selected.id = obj.id;
    }
    return selected;
  });
}


const boardSnapshotQuerySchema = z.object({
  listLimit: z.coerce.number().int().min(1).max(500).optional(),
});
const boardMembersQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['displayName:asc', 'displayName:desc', 'email:asc', 'email:desc']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// Create board
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createBoardSchema.parse(req.body);
    const normalizedThemeSettings =
      validated.themeSettings !== undefined
        ? normalizeBoardThemeSettings(validated.themeSettings)
        : undefined;
    const board = await createBoard({
      ...validated,
      ...(normalizedThemeSettings !== undefined ? { themeSettings: normalizedThemeSettings } : {}),
      ownerId: authReq.user.id,
    });

    res.status(201).json({ board });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

// Get all boards for user (optionally filtered by workspace)
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.query.workspaceId as string | undefined;
    const query = boardViewQuerySchema.parse(req.query);
    const options =
      query.view === undefined && query.skip === undefined && query.limit === undefined
        ? undefined
        : {
            ...(query.view !== undefined ? { view: query.view } : {}),
            ...(query.skip !== undefined ? { skip: query.skip } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
          };
    const boards = await getUserBoards(authReq.user.id, workspaceId, options);
    const responseBoards =
      query.view === 'summary' ? selectFields(boards, query.fields) : boards;
    const hasMore = query.limit !== undefined && boards.length === query.limit;
    res.json({
      boards: responseBoards,
      ...(query.limit !== undefined ? { hasMore } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Get boards by workspace (deprecated, use GET /?workspaceId=... instead, but kept for backwards compatibility)
router.get('/workspace/:workspaceId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = boardViewQuerySchema.parse(req.query);
    const options =
      query.view === undefined && query.skip === undefined && query.limit === undefined
        ? undefined
        : {
            ...(query.view !== undefined ? { view: query.view } : {}),
            ...(query.skip !== undefined ? { skip: query.skip } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
          };
    const boards = await getBoardsByWorkspace(req.params.workspaceId, authReq.user.id, options);
    const responseBoards =
      query.view === 'summary' ? selectFields(boards, query.fields) : boards;
    const hasMore = query.limit !== undefined && boards.length === query.limit;
    res.json({
      boards: responseBoards,
      ...(query.limit !== undefined ? { hasMore } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

router.get('/:id/kanban-snapshot', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = boardSnapshotQuerySchema.parse(req.query);
    const snapshotOptions =
      query.listLimit !== undefined ? { listLimit: query.listLimit } : undefined;
    const snapshot = await getBoardKanbanSnapshotForUser(
      req.params.id,
      authReq.user.id,
      snapshotOptions
    );
    if (!snapshot) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json(snapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

router.post('/:id/cards/descriptions-batch', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardId = req.params.id;
    const body = cardDescriptionsBatchBodySchema.parse(req.body);
    const cards = await getCardDescriptionFieldsBatchForBoard(boardId, authReq.user.id, body.cardIds);
    res.json({ cards });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message === 'Board not found') {
      res.status(404).json({
        error: { message: 'Board not found', code: 'NOT_FOUND', statusCode: 404 },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      res.status(403).json({
        error: { message: error.message, code: 'FORBIDDEN', statusCode: 403 },
      });
      return;
    }
    next(error);
  }
});

router.patch('/:id/lists/bulk-color', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardId = req.params.id;
    const body = bulkListColorBodySchema.parse(req.body);
    const result = await bulkUpdateListColorsForBoard(boardId, body.color, authReq.user.id);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message === 'Board not found') {
      res.status(404).json({
        error: { message: 'Board not found', code: 'NOT_FOUND', statusCode: 404 },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      res.status(403).json({
        error: { message: error.message, code: 'FORBIDDEN', statusCode: 403 },
      });
      return;
    }
    next(error);
  }
});

router.patch('/:id/cards/bulk-color', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardId = req.params.id;
    const body = bulkCardColorBodySchema.parse(req.body);
    const result = await bulkUpdateCardColorsForBoard(boardId, authReq.user.id, {
      color: body.color,
      listId: body.listId,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message === 'Board not found') {
      res.status(404).json({
        error: { message: 'Board not found', code: 'NOT_FOUND', statusCode: 404 },
      });
      return;
    }
    if (error instanceof Error && error.message === 'List not found on board') {
      res.status(400).json({
        error: { message: error.message, code: 'BAD_REQUEST', statusCode: 400 },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      res.status(403).json({
        error: { message: error.message, code: 'FORBIDDEN', statusCode: 403 },
      });
      return;
    }
    next(error);
  }
});

router.get('/:id/permissions/me', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardId = req.params.id;
    // Minimal payload: current effective allow-list (client gating uses this).
    // For now, we probe known keys by asking hasPermission; clients should not rely on full enumeration.
    const keys = [
      'boards.view',
      'boards.update',
      'boards.reorder_in_home',
      'boards.settings.update',
      'boards.members.view',
      'boards.members.add',
      'boards.members.remove',
      'boards.members.role.update',
      'invites.create',
      'invites.view',
      'invites.delete',
      'labels.create',
      'labels.update',
      'labels.delete',
      'lists.create',
      'lists.update',
      'lists.delete',
      'lists.reorder',
      'comments.create',
      'comments.delete',
      'cards.create',
      'cards.update',
      'cards.delete',
      'cards.duplicate',
      'cards.move',
      'cards.reorder',
      'cards.dates.start.edit',
      'cards.dates.due.edit',
      'cards.dates.end.edit',
    ] as const;
    const allowed: string[] = [];
    for (const key of keys) {
      if (await hasPermission(authReq.user, boardId, key)) {
        allowed.push(key);
      }
    }
    res.json({ boardId, permissions: allowed, serverTs: Date.now() });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/roles', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardId = req.params.id;
    const allowed = await hasPermission(authReq.user, boardId, 'boards.members.view');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to view roles',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    const board = await Board.findById(boardId).select('ownerId workspaceId members.userId members.roleKey').lean();
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    const roles = await RoleDefinition.find()
      .sort({ isBuiltIn: -1, key: 1 })
      .select('key displayName isBuiltIn hierarchyLevel')
      .lean();

    const userId = authReq.user.id;
    if (String(board.ownerId) === userId) {
      res.json({
        roles: roles.map((r) => ({ key: r.key, displayName: r.displayName, isBuiltIn: r.isBuiltIn })),
      });
      return;
    }

    let actorRoleKey: string | null = null;
    const boardMember = (board.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
      (m) => String(m.userId) === userId,
    );
    if (typeof boardMember?.roleKey === 'string' && boardMember.roleKey.trim() !== '') {
      actorRoleKey = boardMember.roleKey.trim();
    } else if (board.workspaceId != null) {
      const workspace = await Workspace.findById(board.workspaceId).select('ownerId members.userId members.roleKey').lean();
      if (workspace) {
        if (String(workspace.ownerId) === userId) {
          actorRoleKey = 'admin';
        } else {
          const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
            (m) => String(m.userId) === userId,
          );
          if (typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== '') {
            actorRoleKey = wsMember.roleKey.trim();
          }
        }
      }
    }

    if (actorRoleKey == null) {
      res.json({ roles: [] });
      return;
    }

    const actorLevel = await getRoleHierarchyLevel(actorRoleKey);
    const mode = await resolveBoardRoleUpdateModeForActor(userId, boardId);
    if (actorLevel == null || mode == null) {
      res.json({ roles: [] });
      return;
    }

    const filtered: Array<{ key: string; displayName: string; isBuiltIn: boolean }> = [];
    for (const role of roles) {
      const isActorOwnRoleKey = role.key === actorRoleKey;
      const level =
        typeof role.hierarchyLevel === 'number' && Number.isFinite(role.hierarchyLevel)
          ? role.hierarchyLevel
          : await getRoleHierarchyLevel(role.key);
      // Always expose the viewer's own role in pickers so settings can display their current assignment,
      // even when role-update mode (e.g. lower-only) forbids assigning that level to others.
      if (isActorOwnRoleKey) {
        filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
        continue;
      }
      if (level == null) {
        continue;
      }
      if (mode !== 'boards.members.role.update.any' && level > actorLevel) {
        continue;
      }
      const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
        mode,
        actorLevel,
        targetCurrentLevel: level,
        targetNextLevel: level,
        selfChange: false,
      });
      if (!allowedByMode) {
        continue;
      }
      filtered.push({ key: role.key, displayName: role.displayName, isBuiltIn: role.isBuiltIn });
    }

    res.json({ roles: filtered });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/members', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = boardMembersQuerySchema.parse(req.query);
    const options: {
      q?: string;
      sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
      cursor?: string;
      limit?: number;
    } = {};
    if (query.q !== undefined) options.q = query.q;
    if (query.sort !== undefined) options.sort = query.sort;
    if (query.cursor !== undefined) options.cursor = query.cursor;
    if (query.limit !== undefined) options.limit = query.limit;
    const result = await getBoardMembersPage(req.params.id, authReq.user.id, options);
    if (!result) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Reorder boards within one workspace on the home page
router.put('/reorder', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = reorderBoardsSchema.parse(req.body);
    const workspaceId = validated.workspaceId;
    await reorderBoardsInHomeScope(authReq.user.id, workspaceId, validated.orderedBoardIds);
    res.json({ message: 'Board order updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('Invalid')) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'INVALID_REORDER',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

// Get board by ID
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = boardViewQuerySchema.parse(req.query);
    const options = query.view !== undefined ? { view: query.view } : undefined;
    const board = await getBoardById(req.params.id, authReq.user.id, options);
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    const responseBoard =
      query.view === 'summary' ? selectFields([board], query.fields)[0] : board;
    res.json({ board: responseBoard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

// Update board
router.put('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateBoardSchema.parse(req.body);
    const normalizedThemeSettings =
      validated.themeSettings !== undefined
        ? normalizeBoardThemeSettings(validated.themeSettings)
        : undefined;
    const board = await updateBoard(
      req.params.id,
      {
        ...validated,
        ...(normalizedThemeSettings !== undefined ? { themeSettings: normalizedThemeSettings } : {}),
      },
      authReq.user.id,
    );
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ board });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof Error && error.message.includes('permissions')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

router.post(
  '/:id/background-image',
  fileUploadRateLimiter,
  boardBackgroundUpload.single('file'),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (req.file == null) {
        res.status(400).json({
          error: {
            message: 'File is required',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      const boardDoc = await Board.findById(req.params.id);
      if (boardDoc == null) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      const previousThemeSettings = normalizeBoardThemeSettings(boardDoc.themeSettings);
      const previousImageUrl =
        previousThemeSettings.backgroundMode === 'image'
          ? previousThemeSettings.backgroundImageUrl?.trim() ?? ''
          : '';
      if (previousImageUrl !== '') {
        await deleteBoardBackgroundByPublicUrl(previousImageUrl);
      }

      const url = await uploadBoardBackgroundAsset(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );
      const nextThemeSettings = normalizeBoardThemeSettings(boardDoc.themeSettings);
      nextThemeSettings.backgroundMode = 'image';
      nextThemeSettings.backgroundImageUrl = url;
      const board = await updateBoard(
        req.params.id,
        {
          themeSettings: nextThemeSettings,
          background: url,
        },
        authReq.user.id,
      );
      if (board == null) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ url, board });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'BACKGROUND_UPLOAD_FAILED',
            statusCode: 400,
          },
        });
        return;
      }
      next(error);
    }
  },
);

router.delete('/:id/background-image', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const boardDoc = await Board.findById(req.params.id);
    if (boardDoc == null) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    const nextThemeSettings = normalizeBoardThemeSettings(boardDoc.themeSettings);
    const existingImageUrl =
      nextThemeSettings.backgroundMode === 'image'
        ? nextThemeSettings.backgroundImageUrl?.trim() ?? ''
        : '';
    if (existingImageUrl !== '') {
      await deleteBoardBackgroundByPublicUrl(existingImageUrl);
    }
    delete nextThemeSettings.backgroundImageUrl;
    nextThemeSettings.backgroundMode = 'color';
    if ((nextThemeSettings.backgroundColor?.trim() ?? '') === '') {
      nextThemeSettings.backgroundColor = nextThemeSettings.selectedTheme.palette.canvasBg;
    }
    const board = await updateBoard(
      req.params.id,
      {
        themeSettings: nextThemeSettings,
        background: nextThemeSettings.backgroundColor,
      },
      authReq.user.id,
    );
    if (board == null) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ board });
  } catch (error) {
    next(error);
  }
});

// Add board member
router.post('/:id/members', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId, role, roleKey } = req.body as { userId?: unknown; role?: unknown; roleKey?: unknown };
    const roleKeyCandidate =
      typeof roleKey === 'string' && roleKey.trim() !== ''
        ? roleKey.trim()
        : typeof role === 'string'
          ? role
          : '';
    if (!userId || typeof userId !== 'string' || roleKeyCandidate === '') {
      res.status(400).json({
        error: {
          message: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    if (!(isBuiltInRoleKey(roleKeyCandidate) || isValidCustomRoleKey(roleKeyCandidate))) {
      res.status(400).json({
        error: {
          message: 'Invalid roleKey',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    if (isValidCustomRoleKey(roleKeyCandidate)) {
      const exists = await RoleDefinition.findOne({ key: roleKeyCandidate }).select('_id').lean();
      if (!exists) {
        res.status(400).json({
          error: {
            message: 'Unknown roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
    }
    const targetUser = await User.findById(userId).select('displayName').lean();
    const targetDisplayName =
      targetUser?.displayName != null && targetUser.displayName.trim() !== ''
        ? targetUser.displayName.trim()
        : 'Unknown user';
    const board = await addBoardMember(req.params.id, userId, roleKeyCandidate, authReq.user.id, {
      targetDisplayName,
    });
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ board });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('permissions') || error.message.includes('already'))) {
      res.status(400).json({
        error: {
          message: error.message,
          code: error.message.includes('permissions') ? 'FORBIDDEN' : 'CONFLICT',
          statusCode: error.message.includes('permissions') ? 403 : 409,
        },
      });
      return;
    }
    next(error);
  }
});

// Remove board member
router.delete('/:id/members/:memberId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const removedUser = await User.findById(req.params.memberId).select('displayName').lean();
    const targetDisplayName =
      removedUser?.displayName != null && removedUser.displayName.trim() !== ''
        ? removedUser.displayName.trim()
        : 'Unknown user';
    const board = await removeBoardMember(
      req.params.id,
      req.params.memberId,
      authReq.user.id,
      { targetDisplayName },
    );
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ board });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('permissions') || error.message.includes('owner'))) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

// Update board member role
router.put('/:id/members/:memberId/role', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { role, roleKey } = req.body as { role?: unknown; roleKey?: unknown };
    const roleKeyCandidate =
      typeof roleKey === 'string' && roleKey.trim() !== ''
        ? roleKey.trim()
        : typeof role === 'string'
          ? role
          : '';
    if (roleKeyCandidate === '') {
      res.status(400).json({
        error: {
          message: 'Invalid roleKey',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    if (!(isBuiltInRoleKey(roleKeyCandidate) || isValidCustomRoleKey(roleKeyCandidate))) {
      res.status(400).json({
        error: {
          message: 'Invalid roleKey',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    if (isValidCustomRoleKey(roleKeyCandidate)) {
      const exists = await RoleDefinition.findOne({ key: roleKeyCandidate }).select('_id').lean();
      if (!exists) {
        res.status(400).json({
          error: {
            message: 'Unknown roleKey',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
    }
    const memberUser = await User.findById(req.params.memberId).select('displayName').lean();
    const targetDisplayName =
      memberUser?.displayName != null && memberUser.displayName.trim() !== ''
        ? memberUser.displayName.trim()
        : 'Unknown user';
    const board = await updateBoardMemberRole(
      req.params.id,
      req.params.memberId,
      roleKeyCandidate,
      authReq.user.id,
      { targetDisplayName },
    );
    if (!board) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ board });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('permissions') || error.message.includes('owner') || error.message.includes('not found'))) {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

// Delete board
router.delete('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const deleted = await deleteBoard(req.params.id, authReq.user.id);
    if (!deleted) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('owner')) {
      res.status(403).json({
        error: {
          message: error.message,
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as boardRoutes };


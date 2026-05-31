import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from '../../models/User.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { getBoardById } from '../../services/boardService.js';
import {
  listBoardImportPlaceholderDirectoryUsers,
  searchRegisteredUsers,
} from '../../services/userDirectoryService.js';
import { hasPermission, userCanCreateWorkspace, userCanUseImportDisplay } from '../../utils/permissions.js';
import { Workspace } from '../../models/Workspace.js';
import { sanitizeAndSaveHomeBoardOrderForWorkspace } from '../../services/homeBoardPreferencesService.js';
import { sanitizeAndMergeHomeWorkspaceOrder } from '../../services/workspaceService.js';
import {
  attachCustomBoardThemesToPreferences,
  loadSystemThemeCatalog,
  replaceUserCustomThemes,
} from '../../services/boardThemeService.js';
import { normalizeBoardThemeSettings } from '../../../shared/boardTheme.js';

const router = Router();

// Validation schema for updating user profile
const updateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
});

const updatePreferencesSchema = z
  .object({
    language: z.string().min(2).max(20).optional(),
    homeWorkspaceOrder: z.array(z.string().min(1)).max(500).optional(),
    homeBoardOrderPatch: z
      .object({
        workspaceId: z.string().min(1).max(128),
        orderedBoardIds: z.array(z.string().min(1)).max(500),
      })
      .optional(),
    customBoardThemes: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          name: z.string().min(1).max(80),
          palette: z.object({
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
          }),
        }),
      )
      .max(250)
      .optional(),
  })
  .strict();

function collectBoardOccupantUserIds(
  board: NonNullable<Awaited<ReturnType<typeof getBoardById>>>
): string[] {
  const ids: string[] = [];
  const owner = board.ownerId as unknown;
  if (owner && typeof owner === 'object' && owner !== null && '_id' in owner) {
    ids.push(String((owner as { _id: mongoose.Types.ObjectId })._id));
  } else {
    ids.push(String(owner));
  }
  for (const m of board.members) {
    const u = m.userId as unknown;
    if (u && typeof u === 'object' && u !== null && '_id' in u) {
      ids.push(String((u as { _id: mongoose.Types.ObjectId })._id));
    } else {
      ids.push(String(u));
    }
  }
  return ids;
}

/** Search registered users (directory / board member picker). Optional boardId excludes current board occupants. */
router.get('/search', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const boardId = typeof req.query.boardId === 'string' ? req.query.boardId.trim() : '';
    const workspaceId =
      typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';
    const appAdminDirectory =
      req.query.appAdminDirectory === '1' || req.query.appAdminDirectory === 'true';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 80;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';

    if (
      !appAdminDirectory &&
      boardId.length === 0 &&
      workspaceId.length === 0 &&
      q.trim().length < 2
    ) {
      res.json({ users: [] });
      return;
    }

    let excludeUserIds: string[] = [];
    if (appAdminDirectory) {
      if (!authReq.user.isAppAdmin) {
        res.status(403).json({
          error: {
            message: 'Insufficient permissions to list users for App Admin management',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      const adminDocs = await User.find({ isAppAdmin: true }).select('_id').lean();
      excludeUserIds = adminDocs.map((d) => String(d._id));
    } else if (boardId.length > 0) {
      const board = await getBoardById(boardId, authReq.user.id);
      if (!board) {
        res.status(403).json({
          error: {
            message: 'Board not found or access denied',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }

      const requesterId = authReq.user.id;
      const ownerRaw = board.ownerId as unknown;
      const ownerIdStr =
        ownerRaw && typeof ownerRaw === 'object' && ownerRaw !== null && '_id' in ownerRaw
          ? String((ownerRaw as { _id: mongoose.Types.ObjectId })._id)
          : String(ownerRaw);
      if (ownerIdStr !== requesterId) {
        const allowed = await hasPermission({ id: requesterId }, boardId, 'boards.members.view');
        if (!allowed) {
          res.status(403).json({
            error: {
              message: 'Insufficient permissions to list users for this board',
              code: 'FORBIDDEN',
              statusCode: 403,
            },
          });
          return;
        }
      }

      const occupantIds = collectBoardOccupantUserIds(board);
      const occupantDocs = await User.find({ _id: { $in: occupantIds } })
        .select('_id isPlaceholder')
        .lean();
      excludeUserIds = occupantDocs
        .filter((doc) => doc.isPlaceholder !== true)
        .map((doc) => String(doc._id));
    }
    if (workspaceId.length > 0) {
      const requesterId = authReq.user.id;
      const workspace = await Workspace.findById(workspaceId).select('ownerId members').lean();
      if (!workspace) {
        res.status(404).json({
          error: {
            message: 'Workspace not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      if (String(workspace.ownerId) !== requesterId) {
        const wsMember = (workspace.members as Array<{ userId: unknown; role?: unknown }>).find(
          (m) => String(m.userId) === requesterId,
        );
        // Mirror current workspace member management rules: only owner/admin can manage membership.
        if (typeof wsMember?.role !== 'string' || wsMember.role !== 'admin') {
          res.status(403).json({
            error: {
              message: 'Insufficient permissions to list users for this workspace',
              code: 'FORBIDDEN',
              statusCode: 403,
            },
          });
          return;
        }
      }

      excludeUserIds = [
        String(workspace.ownerId),
        ...(workspace.members as Array<{ userId: unknown }>).map((m) => String(m.userId)),
      ];
    }

    const result = await searchRegisteredUsers({
      query: q,
      limit,
      excludeUserIds,
      ...(cursor !== '' ? { cursor } : {}),
    });

    let users = result.users;
    if (boardId.length > 0 && cursor === '') {
      const placeholders = await listBoardImportPlaceholderDirectoryUsers({
        boardId,
        requesterUserId: authReq.user.id,
        query: q,
        limit,
      });
      const seen = new Set(users.map((u) => u._id));
      users = [...placeholders.filter((p) => !seen.has(p._id)), ...users];
    }

    res.json({
      users,
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
    });
  } catch (error) {
    next(error);
  }
});

// Update current user profile endpoint
router.put('/me', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;

    // Validate request body
    const validated = updateUserProfileSchema.parse(req.body);

    // Find user
    const user = await User.findById(authReq.user.id);
    if (!user) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Update user fields
    if (validated.displayName !== undefined) {
      user.displayName = validated.displayName.trim();
    }

    // Save updated user
    await user.save();

    // Return updated user
    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
      },
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

router.get('/me/home-capabilities', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const [canCreateWorkspace, canUseImport] = await Promise.all([
      userCanCreateWorkspace(authReq.user.id, authReq.user.isAppAdmin),
      userCanUseImportDisplay(authReq.user.id, authReq.user.isAppAdmin),
    ]);
    res.json({
      capabilities: {
        'workspaces.create': canCreateWorkspace,
        'import.display': canUseImport,
      },
      serverTs: Date.now(),
    });
  } catch (error) {
    next(error);
  }
});

// Current user preferences (GET / PUT must be registered alongside /me)
router.get('/me/preferences', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await User.findById(authReq.user.id);
    if (!user) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    res.json({
      preferences: await attachCustomBoardThemesToPreferences(authReq.user.id, user.preferences),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/me/preferences', apiRateLimiter, requireAuth as RequestHandler, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updatePreferencesSchema.parse(req.body);

    const user = await User.findById(authReq.user.id);
    if (!user) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (validated.language !== undefined) {
      user.preferences.language = validated.language;
    }

    if (validated.homeWorkspaceOrder !== undefined) {
      user.preferences.homeWorkspaceOrder = await sanitizeAndMergeHomeWorkspaceOrder(
        authReq.user.id,
        validated.homeWorkspaceOrder,
      );
    }
    if (validated.homeBoardOrderPatch !== undefined) {
      await sanitizeAndSaveHomeBoardOrderForWorkspace(
        authReq.user.id,
        validated.homeBoardOrderPatch.workspaceId,
        validated.homeBoardOrderPatch.orderedBoardIds,
      );
      const refreshed = await User.findById(authReq.user.id);
      if (refreshed != null) {
        user.preferences = refreshed.preferences;
      }
    }
    if (validated.customBoardThemes !== undefined) {
      const catalog = await loadSystemThemeCatalog();
      const normalizedThemes = validated.customBoardThemes.map((theme) => {
        const normalized = normalizeBoardThemeSettings(
          {
            selectedThemeId: theme.id,
            selectedTheme: theme,
            customThemes: [theme],
            smartContrast: true,
            backgroundMode: 'theme',
            backgroundColor: theme.palette.canvasBg,
          },
          undefined,
          catalog,
        );
        return normalized.selectedTheme;
      });
      await replaceUserCustomThemes(authReq.user.id, normalizedThemes);
    }

    user.preferences.theme = 'light';

    user.markModified('preferences');
    await user.save();

    const preferences = await attachCustomBoardThemesToPreferences(authReq.user.id, user.preferences);

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        isAppAdmin: user.isAppAdmin,
        preferences,
        emailVerified: user.emailVerified,
      },
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

export { router as userProfileRoutes };

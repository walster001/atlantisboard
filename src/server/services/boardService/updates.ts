import mongoose, { type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import {
  hasPermission,
  isWorkspaceMember,
  userCanReorganizeWorkspaceHomeBoardBucket,
} from '../../utils/permissions.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import {
  hydrateBoardDocumentForUser,
  hydrateBoardThemeSettings,
  loadThemeCatalogForContext,
  persistBoardThemeSettings,
} from '../boardThemeService.js';
import {
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import type { UpdateBoardInput } from './types.js';
import { emitBoardPatchedOnly, emitBoardUpdatedRealtime, emitWorkspaceTransitionsOnBoardMove } from './shared.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';
import { boardMemberUserIdSet } from '../boardActivityWeeklyRoundup/recipients.js';

export async function updateBoard(
  boardId: string,
  input: UpdateBoardInput,
  userId: string,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  const prevWorkspaceId = board.workspaceId?.toString() ?? null;

  const isOwner = board.ownerId.toString() === userId;
  const hasThemeMutation = input.background !== undefined || input.themeSettings !== undefined;
  const hasNonThemeMutation =
    input.workspaceId !== undefined ||
    input.name !== undefined ||
    input.description !== undefined ||
    input.visibility !== undefined ||
    input.settings !== undefined;

  if (!isOwner) {
    if (hasThemeMutation) {
      const canChangeTheme = await hasPermission({ id: userId }, boardId, 'boards.themes.changetheme');
      if (!canChangeTheme) {
        throw new ForbiddenError('Insufficient permissions to update board theme/background');
      }
    }
    if (input.themeSettings !== undefined) {
      const catalog = await loadThemeCatalogForContext(userId);
      const previousThemeSettings = await hydrateBoardThemeSettings(
        board.themeSettings,
        board.ownerId.toString(),
      );
      const nextNormalized = normalizeBoardThemeSettings(input.themeSettings, previousThemeSettings, catalog);
      const previousCustomIds = new Set(previousThemeSettings.customThemes.map((t) => t.id));
      const nextCustomIds = new Set(nextNormalized.customThemes.map((t) => t.id));
      const customThemesChanged =
        previousCustomIds.size !== nextCustomIds.size ||
        [...nextCustomIds].some((id) => !previousCustomIds.has(id));
      if (customThemesChanged) {
        const canManageCustomThemes = await hasPermission({ id: userId }, boardId, 'boards.themes.customtheme');
        if (!canManageCustomThemes) {
          throw new ForbiddenError('Insufficient permissions to manage custom board themes');
        }
      }
    }
    if (hasNonThemeMutation) {
      const allowed = await hasPermission({ id: userId }, boardId, 'boards.update');
      if (!allowed) {
        throw new ForbiddenError('Insufficient permissions to update board');
      }
    }
  }

  // Verify workspace exists if provided; assign position when moving between home buckets
  if (input.workspaceId !== undefined) {
    const prevKey = board.workspaceId?.toString() ?? null;
    const nextKey = input.workspaceId ? String(input.workspaceId) : null;
    const workspaceChanged = prevKey !== nextKey;

    if (workspaceChanged) {
      const isBoardOwner = board.ownerId.toString() === userId;
      const assertMayOrganizeBucket = async (wid: string, direction: 'out' | 'in'): Promise<void> => {
        const ok =
          (await userCanReorganizeWorkspaceHomeBoardBucket(userId, wid)) ||
          (isBoardOwner && (await isWorkspaceMember(userId, wid)));
        if (!ok) {
          throw new ForbiddenError(
            direction === 'out'
              ? 'Insufficient permissions to move board out of this workspace'
              : 'Insufficient permissions to move board into this workspace',
          );
        }
      };
      if (prevKey != null && prevKey !== '') {
        await assertMayOrganizeBucket(prevKey, 'out');
      }
      if (nextKey != null && nextKey !== '') {
        await assertMayOrganizeBucket(nextKey, 'in');
      }
    }

    if (input.workspaceId) {
      const workspace = await Workspace.findById(input.workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      board.workspaceId = new mongoose.Types.ObjectId(input.workspaceId);
    } else {
      delete board.workspaceId;
    }

    if (workspaceChanged) {
      if (input.workspaceId) {
        const wid = new mongoose.Types.ObjectId(input.workspaceId);
        const last = await Board.findOne({
          workspaceId: wid,
          _id: { $ne: board._id },
        })
          .sort({ position: -1 })
          .select('position')
          .lean();
        board.position = (typeof last?.position === 'number' ? last.position : -1) + 1;
      } else {
        const last = await Board.findOne({
          ownerId: board.ownerId,
          _id: { $ne: board._id },
          $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }],
        })
          .sort({ position: -1 })
          .select('position')
          .lean();
        board.position = (typeof last?.position === 'number' ? last.position : -1) + 1;
      }
    }
  }

  if (input.name !== undefined) board.name = input.name;
  if (input.description !== undefined) board.description = input.description;
  if (input.background !== undefined) board.background = input.background;
  if (input.themeSettings !== undefined) {
    const { hydrated, stored } = await persistBoardThemeSettings({
      userId,
      settings: input.themeSettings as BoardThemeSettings,
    });
    board.themeSettings = stored;
    if (input.background === undefined) {
      const resolvedBackground = resolveBoardBackgroundFromThemeSettings(hydrated);
      if (resolvedBackground !== undefined) {
        board.background = resolvedBackground;
      }
    }
  }
  if (input.visibility !== undefined) board.visibility = input.visibility;
  if (input.settings) {
    if (input.settings.allowComments !== undefined) board.settings.allowComments = input.settings.allowComments;
    if (input.settings.allowAttachments !== undefined) board.settings.allowAttachments = input.settings.allowAttachments;
    if (input.settings.cardCoverImages !== undefined) board.settings.cardCoverImages = input.settings.cardCoverImages;
    if (input.settings.showDueDateAndReminders !== undefined) {
      board.settings.showDueDateAndReminders = input.settings.showDueDateAndReminders;
    }
    if (input.settings.showRemindersOnCards !== undefined) {
      board.settings.showRemindersOnCards = input.settings.showRemindersOnCards;
    }
    if (input.settings.showStartDateOnCards !== undefined) {
      board.settings.showStartDateOnCards = input.settings.showStartDateOnCards;
    }
    if (input.settings.showDueDateOnCards !== undefined) {
      board.settings.showDueDateOnCards = input.settings.showDueDateOnCards;
    }
    if (input.settings.showEndDateOnCards !== undefined) {
      board.settings.showEndDateOnCards = input.settings.showEndDateOnCards;
    }
    if (input.settings.showLabels !== undefined) board.settings.showLabels = input.settings.showLabels;
    if (input.settings.showAssignees !== undefined) board.settings.showAssignees = input.settings.showAssignees;
    if (input.settings.showChecklist !== undefined) board.settings.showChecklist = input.settings.showChecklist;
    if (input.settings.showAttachments !== undefined) {
      board.settings.showAttachments = input.settings.showAttachments;
    }
    if (input.settings.showComments !== undefined) board.settings.showComments = input.settings.showComments;
    if (input.settings.showListCardCount !== undefined) {
      board.settings.showListCardCount = input.settings.showListCardCount;
    }
    if (input.settings.showCardDescriptionPreview !== undefined) {
      board.settings.showCardDescriptionPreview = input.settings.showCardDescriptionPreview;
    }
    if (input.settings.listMaxCards !== undefined) board.settings.listMaxCards = input.settings.listMaxCards;
    if (input.settings.listEnforceMaxCards !== undefined) {
      board.settings.listEnforceMaxCards = input.settings.listEnforceMaxCards;
    }
    if (input.settings.listColumnWidthAuto !== undefined) {
      board.settings.listColumnWidthAuto = input.settings.listColumnWidthAuto;
    }
    if (input.settings.listColumnWidthPx !== undefined) {
      board.settings.listColumnWidthPx = input.settings.listColumnWidthPx;
    }
    if (input.settings.memberActivityLogRetentionDays !== undefined) {
      board.settings.memberActivityLogRetentionDays = input.settings.memberActivityLogRetentionDays;
    }
    if (input.settings.activityLogEnabled !== undefined) {
      board.settings.activityLogEnabled = input.settings.activityLogEnabled;
    }
    if (input.settings.activityLogRetentionDays !== undefined) {
      board.settings.activityLogRetentionDays = input.settings.activityLogRetentionDays;
    }
    if (input.settings.activityLogTracking !== undefined) {
      board.settings.activityLogTracking = {
        ...board.settings.activityLogTracking,
        ...input.settings.activityLogTracking,
      };
    }
    if (input.settings.activityLogEmailRoundupEnabled !== undefined) {
      board.settings.activityLogEmailRoundupEnabled = input.settings.activityLogEmailRoundupEnabled;
    }
    if (input.settings.activityLogEmailRoundupUserIds !== undefined) {
      const allowedMembers = boardMemberUserIdSet(board);
      const invalidIds = input.settings.activityLogEmailRoundupUserIds.filter(
        (userId) => !allowedMembers.has(userId),
      );
      if (invalidIds.length > 0) {
        throw new ValidationError(
          'Activity log email roundup recipients must be board members',
        );
      }
      board.settings.activityLogEmailRoundupUserIds = input.settings.activityLogEmailRoundupUserIds.map(
        (userId) => new mongoose.Types.ObjectId(userId),
      );
    }
  }

  await board.save();

  const nextWorkspaceId = board.workspaceId?.toString() ?? null;
  await emitWorkspaceTransitionsOnBoardMove(board, boardId, prevWorkspaceId, nextWorkspaceId);

  logAuditEvent({
    userId,
    action: 'board.update',
    resourceType: 'board',
    resourceId: boardId,
    timestamp: new Date(),
  });

  const hydratedThemeSettings =
    input.themeSettings !== undefined
      ? await hydrateBoardThemeSettings(board.themeSettings, board.ownerId.toString())
      : undefined;

  const changedFields: Record<string, unknown> = {
    ...(input.workspaceId !== undefined
      ? { workspaceId: board.workspaceId?.toString() ?? null, position: board.position }
      : {}),
    ...(input.name !== undefined ? { name: board.name } : {}),
    ...(input.description !== undefined ? { description: board.description } : {}),
    ...(input.background !== undefined ? { background: board.background } : {}),
    ...(hydratedThemeSettings !== undefined ? { themeSettings: hydratedThemeSettings } : {}),
    ...(input.visibility !== undefined ? { visibility: board.visibility } : {}),
    ...(input.settings !== undefined ? { settings: board.settings } : {}),
    updatedAt: board.updatedAt,
  };

  if (hasThemeMutation) {
    await hydrateBoardDocumentForUser(board, userId);
    emitBoardUpdatedRealtime(board, undefined, { changedFields });
  } else {
    emitBoardPatchedOnly(board, changedFields);
  }

  return hydrateBoardDocumentForUser(board, userId);
}

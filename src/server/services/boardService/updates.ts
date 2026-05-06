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
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
} from '../../../shared/boardTheme.js';
import type { UpdateBoardInput } from './types.js';
import { emitBoardUpdatedRealtime, emitWorkspaceTransitionsOnBoardMove } from './shared.js';

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
        throw new Error('Insufficient permissions to update board theme/background');
      }
    }
    if (input.themeSettings !== undefined) {
      const previousThemeSettings = normalizeBoardThemeSettings(board.themeSettings);
      const previousCustomThemes = previousThemeSettings.customThemes;
      const nextCustomThemes = input.themeSettings.customThemes;
      const customThemesChanged = JSON.stringify(previousCustomThemes) !== JSON.stringify(nextCustomThemes);
      if (customThemesChanged) {
        const canManageCustomThemes = await hasPermission({ id: userId }, boardId, 'boards.themes.customtheme');
        if (!canManageCustomThemes) {
          throw new Error('Insufficient permissions to manage custom board themes');
        }
      }
    }
    if (hasNonThemeMutation) {
      const allowed = await hasPermission({ id: userId }, boardId, 'boards.update');
      if (!allowed) {
        throw new Error('Insufficient permissions to update board');
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
          throw new Error(
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
        throw new Error('Workspace not found');
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
    board.themeSettings = normalizeBoardThemeSettings(input.themeSettings, board.themeSettings);
    if (input.background === undefined && board.themeSettings != null) {
      const resolvedBackground = resolveBoardBackgroundFromThemeSettings(board.themeSettings);
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
      if (input.settings.memberActivityLogRetentionDays === null) {
        await Board.updateOne(
          { _id: board._id },
          { $unset: { 'settings.memberActivityLogRetentionDays': '' } },
        );
        Reflect.deleteProperty(
          board.settings as unknown as Record<string, unknown>,
          'memberActivityLogRetentionDays',
        );
      } else {
        board.settings.memberActivityLogRetentionDays = input.settings.memberActivityLogRetentionDays;
      }
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

  emitBoardUpdatedRealtime(board, undefined, {
    changedFields: {
      ...(input.workspaceId !== undefined
        ? { workspaceId: board.workspaceId?.toString() ?? null, position: board.position }
        : {}),
      ...(input.name !== undefined ? { name: board.name } : {}),
      ...(input.description !== undefined ? { description: board.description } : {}),
      ...(input.background !== undefined ? { background: board.background } : {}),
      ...(input.themeSettings !== undefined ? { themeSettings: board.themeSettings } : {}),
      ...(input.visibility !== undefined ? { visibility: board.visibility } : {}),
      ...(input.settings !== undefined ? { settings: board.settings } : {}),
      updatedAt: board.updatedAt,
    },
  });

  return board;
}

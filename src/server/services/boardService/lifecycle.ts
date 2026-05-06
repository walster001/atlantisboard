import mongoose, { type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { Workspace } from '../../models/Workspace.js';
import { hasPermission } from '../../utils/permissions.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import { deleteAllMongoAndStorageForBoardIds } from '../boardScopedDeletion.js';
import { emitWorkspaceHomeAccessRefreshForUser } from '../workspaceService.js';
import {
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
} from '../../../shared/boardTheme.js';
import type { CreateBoardInput } from './types.js';
import {
  emitBoardCreatedRealtime,
  ensureLegacyBoardPositions,
} from './shared.js';

export async function createBoard(input: CreateBoardInput): Promise<Document & IBoard> {
  await ensureLegacyBoardPositions();

  if (!(await hasPermission(input.ownerId, input.workspaceId, 'boards.create', 'workspace'))) {
    throw new Error('Insufficient permissions to create a board in this workspace');
  }

  const workspace = await Workspace.findById(input.workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const wid = new mongoose.Types.ObjectId(input.workspaceId);
  const last = await Board.findOne({ workspaceId: wid })
    .sort({ position: -1 })
    .select('position')
    .lean();
  const position = (typeof last?.position === 'number' ? last.position : -1) + 1;

  const board = new Board({
    workspaceId: input.workspaceId,
    position,
    name: input.name,
    description: input.description,
    background: undefined,
    themeSettings: normalizeBoardThemeSettings(input.themeSettings, createDefaultBoardThemeSettings()),
    visibility: input.visibility || 'private',
    ownerId: input.ownerId,
    members: [],
    settings: {
      allowComments: true,
      allowAttachments: true,
      cardCoverImages: true,
      showDueDateAndReminders: true,
      showRemindersOnCards: true,
      showLabels: true,
      showAssignees: true,
      showChecklist: true,
      showAttachments: true,
      showComments: true,
      showListCardCount: true,
      showCardDescriptionPreview: true,
    },
  });

  if (input.background !== undefined) {
    board.background = input.background;
  } else if (board.themeSettings != null) {
    const resolvedBackground = resolveBoardBackgroundFromThemeSettings(board.themeSettings);
    if (resolvedBackground !== undefined) {
      board.background = resolvedBackground;
    }
  }

  await board.save();

  logAuditEvent({
    userId: input.ownerId,
    action: 'board.create',
    resourceType: 'board',
    resourceId: board._id.toString(),
    metadata: { workspaceId: input.workspaceId },
    timestamp: new Date(),
  });

  logger.info({ boardId: board._id.toString(), ownerId: input.ownerId }, 'Board created');
  emitBoardCreatedRealtime(board);
  return board;
}

export async function deleteBoard(boardId: string, userId: string): Promise<boolean> {
  const board = await Board.findById(boardId);
  if (!board) {
    return false;
  }

  // Only owner can delete
  if (board.ownerId.toString() !== userId) {
    throw new Error('Only board owner can delete board');
  }

  await deleteAllMongoAndStorageForBoardIds([board._id]);

  const workspaceId = board.workspaceId?.toString();
  const ownerId = board.ownerId.toString();
  const memberUserIds = board.members.map((m) => m.userId.toString());

  await Board.findByIdAndDelete(boardId);

  const serverTs = Date.now();
  emitToBoard(boardId, 'board:deleted', { boardId, serverTs });
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'board:deleted', { boardId, serverTs });
  }
  emitToUser(ownerId, 'board:deleted', { boardId, serverTs });
  for (const memberUserId of memberUserIds) {
    if (memberUserId !== ownerId) {
      emitToUser(memberUserId, 'board:deleted', { boardId, serverTs });
    }
  }

  if (workspaceId) {
    const homeAccessUserIds = new Set<string>([ownerId, ...memberUserIds]);
    for (const uid of homeAccessUserIds) {
      void emitWorkspaceHomeAccessRefreshForUser(workspaceId, uid);
    }
  }

  logAuditEvent({
    userId,
    action: 'board.delete',
    resourceType: 'board',
    resourceId: boardId,
    timestamp: new Date(),
  });

  return true;
}

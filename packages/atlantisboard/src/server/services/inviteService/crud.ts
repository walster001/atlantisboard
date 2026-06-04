import {
  InviteLink,
  type IInviteLink,
} from '../../models/InviteLink.js';
import { Workspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { User } from '../../models/User.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission, getUserWorkspaceRole } from '../../utils/permissions.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import type { Document } from 'mongoose';
import {
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
} from '../roleService.js';
import { emitBoardUpdatedRealtime } from '../boardService.js';
import { emitWorkspaceHomeSnapshotToUserById } from '../workspaceService.js';
import { emitToUser } from '../../utils/socketIO.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';
import {
  resolveBoardRoleKeyForUser,
  resolveBoardRoleUpdateModeForActor,
  resolveWorkspaceRoleKeyForUser,
  validateRoleKeyForInvite,
  type CreateInviteInput,
} from './typesAndHelpers.js';
import {
  addUserToAllBoardsInWorkspace,
  emitInviteCreatedRealtime,
  emitInviteDeletedRealtime,
  emitInviteUpdatedRealtime,
} from './realtime.js';

export async function createInviteLink(input: CreateInviteInput): Promise<Document & IInviteLink> {
  if (input.type === 'workspace' && !input.workspaceId) {
    throw new ValidationError('Workspace ID is required for workspace invites');
  }
  if (input.type === 'board' && !input.boardId) {
    throw new ValidationError('Board ID is required for board invites');
  }

  if (input.type === 'workspace' && input.workspaceId) {
    const workspace = await Workspace.findById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    if (workspace.ownerId.toString() !== input.createdBy) {
      const role = await getUserWorkspaceRole(input.createdBy, input.workspaceId);
      if (role !== 'admin') {
        throw new ForbiddenError('Only admins can create workspace invites');
      }
    }
  }

  if (input.type === 'board' && input.boardId) {
    const board = await Board.findById(input.boardId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }
    if (board.ownerId.toString() !== input.createdBy) {
      const allowed = await hasPermission({ id: input.createdBy }, input.boardId, 'invites.create');
      if (!allowed) {
        throw new ForbiddenError('Only admins can create board invites');
      }
    }
  }

  const roleKeyCandidate =
    typeof input.roleKey === 'string' && input.roleKey.trim() !== ''
      ? input.roleKey.trim()
      : (input.role ?? 'viewer');
  await validateRoleKeyForInvite(roleKeyCandidate);

  if (input.type === 'workspace' && input.workspaceId) {
    const workspace = await Workspace.findById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    const actorRoleKey = resolveWorkspaceRoleKeyForUser(workspace, input.createdBy);
    if (actorRoleKey == null) {
      throw new ForbiddenError('Insufficient permissions to assign invite role');
    }
    const [actorLevel, targetLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(roleKeyCandidate),
    ]);
    if (actorLevel == null || targetLevel == null) {
      throw new ValidationError('Invalid role hierarchy configuration');
    }
    if (targetLevel > actorLevel) {
      throw new ForbiddenError('Cannot assign invite role above your hierarchy level');
    }
  }

  if (input.type === 'board' && input.boardId) {
    const board = await Board.findById(input.boardId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }
    if (board.ownerId.toString() !== input.createdBy) {
      const actorRoleKey = await resolveBoardRoleKeyForUser(board, input.createdBy);
      if (actorRoleKey == null) {
        throw new ForbiddenError('Insufficient permissions to assign invite role');
      }
      const mode = await resolveBoardRoleUpdateModeForActor(input.createdBy, input.boardId);
      if (mode == null) {
        throw new ForbiddenError('Insufficient permissions to assign invite role');
      }
      const [actorLevel, targetLevel] = await Promise.all([
        getRoleHierarchyLevel(actorRoleKey),
        getRoleHierarchyLevel(roleKeyCandidate),
      ]);
      if (actorLevel == null || targetLevel == null) {
        throw new ValidationError('Invalid role hierarchy configuration');
      }
      const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
        mode,
        actorLevel,
        targetCurrentLevel: targetLevel,
        targetNextLevel: targetLevel,
        selfChange: false,
      });
      if (!allowedByMode) {
        throw new ForbiddenError('Cannot assign invite role at this hierarchy level');
      }
      if (mode !== 'boards.members.role.update.any' && targetLevel > actorLevel) {
        throw new ForbiddenError('Cannot assign invite role above your hierarchy level');
      }
    }
  }

  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

  const expiresAt = input.inviteType === 'one-time'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000)
    : undefined;

  const inviteLink = new InviteLink({
    workspaceId: input.workspaceId,
    boardId: input.boardId,
    token,
    type: input.type,
    inviteType: input.inviteType,
    roleKey: roleKeyCandidate,
    expiresAt,
    usedCount: 0,
    createdBy: input.createdBy,
  });

  await inviteLink.save();

  emitInviteCreatedRealtime(inviteLink);

  logAuditEvent({
    userId: input.createdBy,
    action: 'invite.create',
    resourceType: input.type,
    resourceId: (input.workspaceId || input.boardId) as string,
    metadata: { inviteType: input.inviteType, roleKey: roleKeyCandidate },
    timestamp: new Date(),
  });

  logger.info(
    {
      inviteId: inviteLink._id.toString(),
      type: input.type,
      inviteType: input.inviteType,
    },
    'Invite link created',
  );

  return inviteLink;
}

export async function acceptInviteLink(token: string, userId: string): Promise<void> {
  const inviteLink = await InviteLink.findOne({ token });

  if (!inviteLink) {
    throw new BadRequestError('Invalid invite link', 'INVALID_INVITE');
  }

  if (inviteLink.expiresAt && inviteLink.expiresAt < new Date()) {
    throw new BadRequestError('Invite link has expired', 'INVALID_INVITE');
  }

  if (inviteLink.inviteType === 'one-time' && inviteLink.usedCount > 0) {
    throw new BadRequestError('Invite link has already been used', 'INVALID_INVITE');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (inviteLink.type === 'workspace' && inviteLink.workspaceId) {
    const workspace = await Workspace.findById(inviteLink.workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const effectiveRoleKey = inviteLink.roleKey.trim();
    await validateRoleKeyForInvite(effectiveRoleKey);

    const isMember = workspace.members.some((m) => m.userId.toString() === userId) ||
                     workspace.ownerId.toString() === userId;

    if (!isMember) {
      workspace.members.push({
        userId: user._id,
        roleKey: effectiveRoleKey,
        joinedAt: new Date(),
      });
      await workspace.save();

      await emitWorkspaceHomeSnapshotToUserById(inviteLink.workspaceId.toString(), userId);

      emitToUser(userId, 'permissions.updated', {
        workspaceId: inviteLink.workspaceId.toString(),
        affectedUserIds: [userId],
        reason: 'workspace.member.add',
        viaInvite: true,
        serverTs: Date.now(),
      });

      logAuditEvent({
        userId,
        action: 'workspace.member.add',
        resourceType: 'workspace',
        resourceId: inviteLink.workspaceId.toString(),
        metadata: { roleKey: effectiveRoleKey, viaInvite: true },
        timestamp: new Date(),
      });
    }

    await addUserToAllBoardsInWorkspace({
      workspaceId: inviteLink.workspaceId.toString(),
      user,
      roleKey: effectiveRoleKey,
    });
  } else if (inviteLink.type === 'board' && inviteLink.boardId) {
    const board = await Board.findById(inviteLink.boardId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }

    const isBoardMember = board.members.some((m) => m.userId.toString() === userId) ||
                          board.ownerId.toString() === userId;

    if (!isBoardMember) {
      const effectiveRoleKey = inviteLink.roleKey.trim();
      await validateRoleKeyForInvite(effectiveRoleKey);
      board.members.push({
        userId: user._id,
        roleKey: effectiveRoleKey,
        addedAt: new Date(),
      });
      await board.save();

      emitBoardUpdatedRealtime(board);

      emitToUser(userId, 'permissions.updated', {
        boardId: inviteLink.boardId.toString(),
        affectedUserIds: [userId],
        reason: 'board.member.add',
        viaInvite: true,
        serverTs: Date.now(),
      });

      const boardWsId = board.workspaceId?.toString();
      if (boardWsId) {
        await emitWorkspaceHomeSnapshotToUserById(boardWsId, userId);
      }

      logAuditEvent({
        userId,
        action: 'board.member.add',
        resourceType: 'board',
        resourceId: inviteLink.boardId.toString(),
        metadata: { roleKey: effectiveRoleKey, viaInvite: true },
        timestamp: new Date(),
      });

      createActivity({
        boardId: inviteLink.boardId.toString(),
        userId,
        type: 'board.member.add',
        description: 'board.member.add',
        metadata: {
          targetUserId: userId,
          targetDisplayName: user.displayName ?? 'Unknown user',
          roleKey: effectiveRoleKey,
          viaInvite: true,
        },
      });
    }
  }

  inviteLink.usedCount += 1;
  inviteLink.lastUsedAt = new Date();

  if (inviteLink.inviteType === 'one-time') {
    inviteLink.expiresAt = new Date();
  }

  await inviteLink.save();

  emitInviteUpdatedRealtime(inviteLink);

  logger.info(
    {
      inviteId: inviteLink._id.toString(),
      userId,
      type: inviteLink.type,
    },
    'Invite link accepted',
  );
}

export async function getInviteLinks(
  workspaceId?: string,
  boardId?: string,
  userId?: string,
): Promise<(Document & IInviteLink)[]> {
  const query: {
    workspaceId?: mongoose.Types.ObjectId;
    boardId?: mongoose.Types.ObjectId;
    $or?: Array<Record<string, unknown>>;
  } = {};

  if (workspaceId) {
    query.workspaceId = new mongoose.Types.ObjectId(workspaceId);
  }
  if (boardId) {
    query.boardId = new mongoose.Types.ObjectId(boardId);
  }
  if (userId) {
    if (boardId) {
      const allowed = await hasPermission({ id: userId }, boardId, 'invites.view');
      if (!allowed) {
        throw new ForbiddenError('Insufficient permissions to view invites');
      }
    } else if (workspaceId) {
      const allowed = await hasPermission(userId, workspaceId, 'invites.view', 'workspace');
      if (!allowed) {
        throw new ForbiddenError('Insufficient permissions to view invites');
      }
    }
  }

  const now = new Date();
  query.$or = [
    { inviteType: 'recurring' },
    {
      inviteType: 'one-time',
      usedCount: 0,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
    },
  ];

  return await InviteLink.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'displayName email');
}

export async function deleteInviteLink(inviteId: string, userId: string): Promise<boolean> {
  const inviteLink = await InviteLink.findById(inviteId);
  if (!inviteLink) {
    return false;
  }

  if (inviteLink.createdBy.toString() !== userId) {
    if (inviteLink.type === 'workspace' && inviteLink.workspaceId) {
      const workspace = await Workspace.findById(inviteLink.workspaceId);
      if (workspace && workspace.ownerId.toString() !== userId) {
        const role = await getUserWorkspaceRole(userId, inviteLink.workspaceId.toString());
        if (role !== 'admin') {
          throw new ForbiddenError('Insufficient permissions to delete invite');
        }
      }
    } else if (inviteLink.type === 'board' && inviteLink.boardId) {
      const board = await Board.findById(inviteLink.boardId);
      if (board && board.ownerId.toString() !== userId) {
        const allowed = await hasPermission({ id: userId }, inviteLink.boardId.toString(), 'invites.delete');
        if (!allowed) {
          throw new ForbiddenError('Insufficient permissions to delete invite');
        }
      }
    }
  }

  emitInviteDeletedRealtime(inviteLink);

  await InviteLink.findByIdAndDelete(inviteId);

  logAuditEvent({
    userId,
    action: 'invite.delete',
    resourceType: inviteLink.type,
    resourceId: (inviteLink.workspaceId || inviteLink.boardId)?.toString() || '',
    timestamp: new Date(),
  });

  logger.info({ inviteId }, 'Invite link deleted');
  return true;
}

import {
  InviteLink,
  type IInviteLink,
  type InviteType,
  type InviteLinkType,
} from '../models/InviteLink.js';
import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { createActivity } from './activityService.js';
import { hasPermission, getUserWorkspaceRole } from '../utils/permissions.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import type { Document } from 'mongoose';
import { RoleDefinition } from '../models/RoleDefinition.js';
import {
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
  isBuiltInRoleKey,
  isValidCustomRoleKey,
  type BoardMemberRoleUpdateModeKey,
} from './roleService.js';
import { emitBoardUpdatedRealtime } from './boardService.js';
import { emitWorkspaceHomeSnapshotToUserById } from './workspaceService.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../utils/socketIO.js';

function uniqueUserIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

async function getInviteAudienceUserIds(invite: Document & IInviteLink): Promise<string[]> {
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();

  if (boardId) {
    const board = await Board.findById(boardId).select('ownerId members.userId').lean();
    if (!board) {
      return uniqueUserIds([invite.createdBy.toString()]);
    }
    const memberIds = (board.members ?? []).map((m) => String(m.userId));
    return uniqueUserIds([String(board.ownerId), ...memberIds, invite.createdBy.toString()]);
  }

  if (workspaceId) {
    const workspace = await Workspace.findById(workspaceId).select('ownerId members.userId').lean();
    if (!workspace) {
      return uniqueUserIds([invite.createdBy.toString()]);
    }
    const memberIds = (workspace.members ?? []).map((m) => String(m.userId));
    return uniqueUserIds([String(workspace.ownerId), ...memberIds, invite.createdBy.toString()]);
  }

  return uniqueUserIds([invite.createdBy.toString()]);
}

function emitInviteCreatedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const data = invite.toObject() as Record<string, unknown>;
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:created', {
      inviteId,
      workspaceId,
      boardId,
      data,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:created', { inviteId, boardId, data, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:created', { inviteId, workspaceId, boardId, data, serverTs });
      }
    })
    .catch(() => undefined);
}

function emitInviteUpdatedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const data = invite.toObject() as Record<string, unknown>;
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:updated', {
      inviteId,
      workspaceId,
      boardId,
      data,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:updated', { inviteId, boardId, data, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:updated', { inviteId, workspaceId, boardId, data, serverTs });
      }
    })
    .catch(() => undefined);
}

function emitInviteDeletedRealtime(invite: Document & IInviteLink): void {
  const inviteId = invite._id.toString();
  const serverTs = Date.now();
  const workspaceId = invite.workspaceId?.toString();
  const boardId = invite.boardId?.toString();
  if (workspaceId) {
    emitToWorkspace(workspaceId, 'invite:deleted', {
      inviteId,
      workspaceId,
      boardId,
      serverTs,
    });
  }
  if (boardId) {
    emitToBoard(boardId, 'invite:deleted', { inviteId, boardId, serverTs });
  }
  void getInviteAudienceUserIds(invite)
    .then((userIds) => {
      for (const uid of userIds) {
        emitToUser(uid, 'invite:deleted', { inviteId, workspaceId, boardId, serverTs });
      }
    })
    .catch(() => undefined);
}

async function addUserToAllBoardsInWorkspace(params: {
  workspaceId: string;
  user: Document & { _id: mongoose.Types.ObjectId; displayName?: string | null };
  roleKey: string;
}): Promise<void> {
  const { workspaceId, user, roleKey } = params;
  const boards = await Board.find({ workspaceId }).select('_id ownerId members').lean();
  if (boards.length === 0) return;

  const boardsToTouch = boards
    .filter((b) => String(b.ownerId) !== String(user._id))
    .filter(
      (b) =>
        !((b.members as Array<{ userId: unknown }>).some((m) => String(m.userId) === String(user._id))),
    );

  const bulk = boardsToTouch.map((b) => ({
    updateOne: {
      filter: { _id: b._id },
      update: {
        $push: {
          members: {
            userId: user._id,
            roleKey,
            addedAt: new Date(),
          },
        },
      },
    },
  }));

  if (bulk.length > 0) {
    await Board.bulkWrite(bulk);
    for (const b of boardsToTouch) {
      const full = await Board.findById(b._id);
      if (full) {
        emitBoardUpdatedRealtime(full);
      }
    }
  }
}

export interface CreateInviteInput {
  workspaceId?: string;
  boardId?: string;
  type: InviteType;
  inviteType: InviteLinkType;
  /** Backward compatible: if roleKey is omitted, fallback to this coarse role. */
  role?: 'admin' | 'manager' | 'viewer';
  roleKey?: string;
  createdBy: string;
}

async function validateRoleKeyForInvite(roleKey: string): Promise<void> {
  if (isBuiltInRoleKey(roleKey)) {
    return;
  }
  if (!isValidCustomRoleKey(roleKey)) {
    throw new Error('Invalid roleKey');
  }
  const exists = await RoleDefinition.findOne({ key: roleKey }).select('_id').lean();
  if (!exists) {
    throw new Error('Unknown roleKey');
  }
}

function resolveWorkspaceRoleKeyForUser(
  workspace: Document & { ownerId: mongoose.Types.ObjectId; members: Array<{ userId: unknown; roleKey: string }> },
  userId: string,
): string | null {
  if (workspace.ownerId.toString() === userId) {
    return 'admin';
  }
  const member = workspace.members.find((m) => String(m.userId) === userId);
  if (member == null || member.roleKey.trim() === '') {
    return null;
  }
  return member.roleKey.trim();
}

async function resolveBoardRoleKeyForUser(
  board: Document & { ownerId: mongoose.Types.ObjectId; workspaceId?: mongoose.Types.ObjectId | null; members: Array<{ userId: unknown; roleKey: string }> },
  userId: string,
): Promise<string | null> {
  if (board.ownerId.toString() === userId) {
    return 'admin';
  }
  const boardMember = board.members.find((m) => String(m.userId) === userId);
  if (boardMember != null && boardMember.roleKey.trim() !== '') {
    return boardMember.roleKey.trim();
  }
  if (board.workspaceId == null) {
    return null;
  }
  const workspace = await Workspace.findById(board.workspaceId).select('ownerId members').lean();
  if (!workspace) {
    return null;
  }
  if (String(workspace.ownerId) === userId) {
    return 'admin';
  }
  const wsMember = (workspace.members as Array<{ userId: unknown; roleKey?: unknown }>).find(
    (m) => String(m.userId) === userId,
  );
  return typeof wsMember?.roleKey === 'string' && wsMember.roleKey.trim() !== ''
    ? wsMember.roleKey.trim()
    : null;
}

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

export async function createInviteLink(input: CreateInviteInput): Promise<Document & IInviteLink> {
  // Validate that either workspaceId or boardId is provided based on type
  if (input.type === 'workspace' && !input.workspaceId) {
    throw new Error('Workspace ID is required for workspace invites');
  }
  if (input.type === 'board' && !input.boardId) {
    throw new Error('Board ID is required for board invites');
  }

  // Check permissions - only admins can create invites
  if (input.type === 'workspace' && input.workspaceId) {
    const workspace = await Workspace.findById(input.workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    if (workspace.ownerId.toString() !== input.createdBy) {
      const role = await getUserWorkspaceRole(input.createdBy, input.workspaceId);
      if (role !== 'admin') {
        throw new Error('Only admins can create workspace invites');
      }
    }
  }

  if (input.type === 'board' && input.boardId) {
    const board = await Board.findById(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    if (board.ownerId.toString() !== input.createdBy) {
      const allowed = await hasPermission({ id: input.createdBy }, input.boardId, 'invites.create');
      if (!allowed) {
        throw new Error('Only admins can create board invites');
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
      throw new Error('Workspace not found');
    }
    const actorRoleKey = resolveWorkspaceRoleKeyForUser(
      workspace as unknown as Document & {
        ownerId: mongoose.Types.ObjectId;
        members: Array<{ userId: unknown; roleKey: string }>;
      },
      input.createdBy,
    );
    if (actorRoleKey == null) {
      throw new Error('Insufficient permissions to assign invite role');
    }
    const [actorLevel, targetLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(roleKeyCandidate),
    ]);
    if (actorLevel == null || targetLevel == null) {
      throw new Error('Invalid role hierarchy configuration');
    }
    if (targetLevel > actorLevel) {
      throw new Error('Cannot assign invite role above your hierarchy level');
    }
  }

  if (input.type === 'board' && input.boardId) {
    const board = await Board.findById(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    if (board.ownerId.toString() !== input.createdBy) {
      const actorRoleKey = await resolveBoardRoleKeyForUser(
        board as unknown as Document & {
          ownerId: mongoose.Types.ObjectId;
          workspaceId?: mongoose.Types.ObjectId | null;
          members: Array<{ userId: unknown; roleKey: string }>;
        },
        input.createdBy,
      );
      if (actorRoleKey == null) {
        throw new Error('Insufficient permissions to assign invite role');
      }
      const mode = await resolveBoardRoleUpdateModeForActor(input.createdBy, input.boardId);
      if (mode == null) {
        throw new Error('Insufficient permissions to assign invite role');
      }
      const [actorLevel, targetLevel] = await Promise.all([
        getRoleHierarchyLevel(actorRoleKey),
        getRoleHierarchyLevel(roleKeyCandidate),
      ]);
      if (actorLevel == null || targetLevel == null) {
        throw new Error('Invalid role hierarchy configuration');
      }
      const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
        mode,
        actorLevel,
        targetCurrentLevel: targetLevel,
        targetNextLevel: targetLevel,
        selfChange: false,
      });
      if (!allowedByMode) {
        throw new Error('Cannot assign invite role at this hierarchy level');
      }
      if (mode !== 'boards.members.role.update.any' && targetLevel > actorLevel) {
        throw new Error('Cannot assign invite role above your hierarchy level');
      }
    }
  }

  // Generate cryptographically secure UUID v4 token (32 characters)
  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

  // Set expiry for one-time invites (1 day)
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
      inviteType: input.inviteType 
    },
    'Invite link created'
  );

  return inviteLink;
}

export async function acceptInviteLink(token: string, userId: string): Promise<void> {
  const inviteLink = await InviteLink.findOne({ token });
  
  if (!inviteLink) {
    throw new Error('Invalid invite link');
  }

  // Check if invite is expired (one-time invites)
  if (inviteLink.expiresAt && inviteLink.expiresAt < new Date()) {
    throw new Error('Invite link has expired');
  }

  // Check if one-time invite has already been used
  if (inviteLink.inviteType === 'one-time' && inviteLink.usedCount > 0) {
    throw new Error('Invite link has already been used');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (inviteLink.type === 'workspace' && inviteLink.workspaceId) {
    const workspace = await Workspace.findById(inviteLink.workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const effectiveRoleKey = inviteLink.roleKey.trim();
    await validateRoleKeyForInvite(effectiveRoleKey);

    // Check if user is already a member
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

    // Workspace invites apply to all boards in the workspace.
    await addUserToAllBoardsInWorkspace({
      workspaceId: inviteLink.workspaceId.toString(),
      user,
      roleKey: effectiveRoleKey,
    });
  } else if (inviteLink.type === 'board' && inviteLink.boardId) {
    const board = await Board.findById(inviteLink.boardId);
    if (!board) {
      throw new Error('Board not found');
    }

    // Check if user is already a board member
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

  // Increment used count and disable one-time invites
  inviteLink.usedCount += 1;
  inviteLink.lastUsedAt = new Date();
  
  // For one-time invites, set expiry to now to effectively disable it
  if (inviteLink.inviteType === 'one-time') {
    inviteLink.expiresAt = new Date();
  }
  
  await inviteLink.save();

  emitInviteUpdatedRealtime(inviteLink);

  logger.info(
    { 
      inviteId: inviteLink._id.toString(),
      userId,
      type: inviteLink.type 
    },
    'Invite link accepted'
  );
}

export async function getInviteLinks(
  workspaceId?: string,
  boardId?: string,
  userId?: string
): Promise<(Document & IInviteLink)[]> {
  const query: {
    workspaceId?: mongoose.Types.ObjectId;
    boardId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
  } = {};
  
  if (workspaceId) {
    query.workspaceId = new mongoose.Types.ObjectId(workspaceId);
  }
  if (boardId) {
    query.boardId = new mongoose.Types.ObjectId(boardId);
  }
  if (userId) {
    query.createdBy = new mongoose.Types.ObjectId(userId);
  }

  return await InviteLink.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'displayName email');
}

export async function deleteInviteLink(inviteId: string, userId: string): Promise<boolean> {
  const inviteLink = await InviteLink.findById(inviteId);
  if (!inviteLink) {
    return false;
  }

  // Check permissions - only creator or admin can delete
  if (inviteLink.createdBy.toString() !== userId) {
    if (inviteLink.type === 'workspace' && inviteLink.workspaceId) {
      const workspace = await Workspace.findById(inviteLink.workspaceId);
      if (workspace && workspace.ownerId.toString() !== userId) {
        const role = await getUserWorkspaceRole(userId, inviteLink.workspaceId.toString());
        if (role !== 'admin') {
          throw new Error('Insufficient permissions to delete invite');
        }
      }
    } else if (inviteLink.type === 'board' && inviteLink.boardId) {
      const board = await Board.findById(inviteLink.boardId);
      if (board && board.ownerId.toString() !== userId) {
        const allowed = await hasPermission({ id: userId }, inviteLink.boardId.toString(), 'invites.delete');
        if (!allowed) {
          throw new Error('Insufficient permissions to delete invite');
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


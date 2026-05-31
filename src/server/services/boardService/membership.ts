import { Types, type Document } from 'mongoose';
import { Board, type IBoard } from '../../models/Board.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { createActivity } from '../activityService.js';
import { hasPermission } from '../../utils/permissions.js';
import { emitToUser } from '../../utils/socketIO.js';
import {
  emitWorkspaceHomeAccessRefreshForUser,
  emitWorkspaceHomeSnapshotToUserById,
} from '../workspaceService.js';
import {
  canAssignByBoardMemberRoleUpdateMode,
  getRoleHierarchyLevel,
} from '../roleService.js';
import {
  emitBoardPatchedOnly,
  emitBoardPermissionsUpdated,
  resolveBoardActorRoleKey,
  resolveBoardRoleUpdateModeForActor,
  resolveTargetDisplayNameForAudit,
} from './shared.js';
import type { BoardMemberAuditHints } from './types.js';

export async function addBoardMember(
  boardId: string,
  userId: string,
  roleKey: string,
  addedBy: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  // Check permissions (owner or admin/manager)
  if (board.ownerId.toString() !== addedBy) {
    const allowed = await hasPermission({ id: addedBy }, boardId, 'boards.members.add');
    if (!allowed) {
      throw new Error('Insufficient permissions to add members');
    }
    const mode = await resolveBoardRoleUpdateModeForActor(addedBy, boardId);
    if (mode == null) {
      throw new Error('Insufficient permissions to assign member role');
    }
    const actorRoleKey = await resolveBoardActorRoleKey(board, addedBy);
    if (actorRoleKey == null) {
      throw new Error('Insufficient permissions to assign member role');
    }
    const [actorLevel, targetNextLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(roleKey),
    ]);
    if (actorLevel == null || targetNextLevel == null) {
      throw new Error('Invalid role hierarchy configuration');
    }
    const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
      mode,
      actorLevel,
      targetCurrentLevel: targetNextLevel,
      targetNextLevel,
      selfChange: false,
    });
    if (!allowedByMode) {
      throw new Error('Cannot assign role at this hierarchy level');
    }
    if (mode !== 'boards.members.role.update.any' && targetNextLevel > actorLevel) {
      throw new Error('Cannot assign a role with higher hierarchy than your own');
    }
  }

  if (board.members.some((m) => m.userId.toString() === userId)) {
    throw new Error('User is already a member');
  }

  board.members.push({
    userId: new Types.ObjectId(userId),
    roleKey,
    addedAt: new Date(),
  });

  await board.save();
  emitBoardPatchedOnly(board, { members: board.members, updatedAt: board.updatedAt });

  const wsId = board.workspaceId?.toString();
  if (wsId) {
    void emitWorkspaceHomeSnapshotToUserById(wsId, userId);
  }

  emitBoardPermissionsUpdated(boardId, [userId], {
    reason: 'board.member.add',
    roleKey,
  });

  logAuditEvent({
    userId: addedBy,
    action: 'board.member.add',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { addedUserId: userId, roleKey },
    timestamp: new Date(),
  });

  const targetDisplayName = await resolveTargetDisplayNameForAudit(userId, auditHints);
  createActivity({
    boardId,
    userId: addedBy,
    type: 'board.member.add',
    description: 'board.member.add',
    metadata: { targetUserId: userId, targetDisplayName, roleKey },
  });

  return board;
}

export async function removeBoardMember(
  boardId: string,
  memberUserId: string,
  userId: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  if (board.ownerId.toString() === memberUserId) {
    throw new Error('Cannot remove board owner');
  }

  if (board.ownerId.toString() !== userId) {
    const allowed = await hasPermission({ id: userId }, boardId, 'boards.members.remove');
    if (!allowed) {
      throw new Error('Insufficient permissions to remove members');
    }
  }

  const targetDisplayName = await resolveTargetDisplayNameForAudit(memberUserId, auditHints);

  board.members = board.members.filter((m) => m.userId.toString() !== memberUserId);
  await board.save();

  emitBoardPatchedOnly(board, { members: board.members, updatedAt: board.updatedAt });
  emitToUser(memberUserId, 'board:deleted', { boardId, serverTs: Date.now() });

  const removedUserWorkspaceId = board.workspaceId?.toString().trim() ?? '';
  if (removedUserWorkspaceId !== '') {
    // If that was their last board here and they are not a workspace member, drop the home row.
    void emitWorkspaceHomeAccessRefreshForUser(removedUserWorkspaceId, memberUserId);
  }

  emitBoardPermissionsUpdated(boardId, [memberUserId], {
    reason: 'board.member.remove',
  });

  logAuditEvent({
    userId,
    action: 'board.member.remove',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { removedUserId: memberUserId },
    timestamp: new Date(),
  });

  createActivity({
    boardId,
    userId,
    type: 'board.member.remove',
    description: 'board.member.remove',
    metadata: { targetUserId: memberUserId, targetDisplayName },
  });

  return board;
}

export async function updateBoardMemberRole(
  boardId: string,
  memberUserId: string,
  newRoleKey: string,
  userId: string,
  auditHints?: BoardMemberAuditHints,
): Promise<(Document & IBoard) | null> {
  const board = await Board.findById(boardId);
  if (!board) {
    return null;
  }

  if (board.ownerId.toString() === memberUserId) {
    throw new Error('Cannot change board owner role');
  }

  const member = board.members.find((m) => m.userId.toString() === memberUserId);
  if (!member) {
    throw new Error('Member not found');
  }

  const previousRoleKey = member.roleKey;
  if (board.ownerId.toString() !== userId) {
    const mode = await resolveBoardRoleUpdateModeForActor(userId, boardId);
    if (mode == null) {
      throw new Error('Insufficient permissions to update member roles');
    }
    const actorRoleKey = await resolveBoardActorRoleKey(board, userId);
    if (actorRoleKey == null) {
      throw new Error('Insufficient permissions to update member roles');
    }
    const [actorLevel, targetCurrentLevel, targetNextLevel] = await Promise.all([
      getRoleHierarchyLevel(actorRoleKey),
      getRoleHierarchyLevel(previousRoleKey),
      getRoleHierarchyLevel(newRoleKey),
    ]);
    if (actorLevel == null || targetCurrentLevel == null || targetNextLevel == null) {
      throw new Error('Invalid role hierarchy configuration');
    }
    const allowedByMode = canAssignByBoardMemberRoleUpdateMode({
      mode,
      actorLevel,
      targetCurrentLevel,
      targetNextLevel,
      selfChange: memberUserId === userId,
    });
    if (!allowedByMode) {
      throw new Error('Role update exceeds your hierarchy permissions');
    }
    if (mode !== 'boards.members.role.update.any' && targetNextLevel > actorLevel) {
      throw new Error('Cannot assign a role with higher hierarchy than your own');
    }
  }

  const targetDisplayName = await resolveTargetDisplayNameForAudit(memberUserId, auditHints);
  member.roleKey = newRoleKey;
  await board.save();

  emitBoardPatchedOnly(board, { members: board.members, updatedAt: board.updatedAt });
  emitBoardPermissionsUpdated(boardId, [memberUserId], {
    reason: 'board.member.role.update',
    roleKey: newRoleKey,
  });

  logAuditEvent({
    userId,
    action: 'board.member.role.update',
    resourceType: 'board',
    resourceId: boardId,
    metadata: { memberUserId, previousRoleKey, newRoleKey },
    timestamp: new Date(),
  });

  createActivity({
    boardId,
    userId,
    type: 'board.member.role.update',
    description: 'board.member.role.update',
    metadata: {
      targetUserId: memberUserId,
      targetDisplayName,
      previousRoleKey,
      newRoleKey,
    },
  });

  return board;
}

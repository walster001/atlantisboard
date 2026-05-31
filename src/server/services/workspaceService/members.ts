import type { Document } from 'mongoose';
import { Workspace, type IWorkspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { User } from '../../models/User.js';
import {
  deleteAllMongoAndStorageForBoardIds,
  deleteWorkspaceScopedMongoRecords,
} from '../boardScopedDeletion.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import { hasPermission } from '../../utils/permissions.js';
import { getRoleHierarchyLevel } from '../roleService.js';
import {
  type AddMemberInput,
  populateWorkspaceMemberListFields,
  workspaceActorRoleKey,
} from './typesAndHelpers.js';
import {
  emitWorkspaceHomeAccessRefreshForUser,
  emitWorkspaceHomeSnapshotToUser,
} from './emit.js';

export async function addWorkspaceMember(
  workspaceId: string,
  input: AddMemberInput,
  userId: string
): Promise<(Document & IWorkspace) | null> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return null;
  }

  if (!(await hasPermission(userId, workspaceId, 'workspaces.members.add', 'workspace'))) {
    throw new Error('Insufficient permissions to add members');
  }

  const actorRoleKey = workspaceActorRoleKey(workspace, userId);
  if (actorRoleKey == null) {
    throw new Error('Insufficient permissions to assign member role');
  }
  const [actorLevel, targetLevel] = await Promise.all([
    getRoleHierarchyLevel(actorRoleKey),
    getRoleHierarchyLevel(input.roleKey),
  ]);
  if (actorLevel == null || targetLevel == null) {
    throw new Error('Invalid role hierarchy configuration');
  }
  if (targetLevel > actorLevel) {
    throw new Error('Cannot assign a role with higher hierarchy than your own');
  }

  // Check if user is already a member
  if (workspace.members.some((m) => m.userId.toString() === input.userId)) {
    throw new Error('User is already a member');
  }

  workspace.members.push({
    userId: input.userId as unknown as typeof workspace.ownerId,
    roleKey: input.roleKey,
    joinedAt: new Date(),
  });

  await workspace.save();

  emitToWorkspace(workspaceId, 'workspace:updated', {
    workspaceId,
    data: workspace.toObject() as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  });
  emitWorkspaceHomeSnapshotToUser(workspace, input.userId);
  void import('../boardService.js')
    .then(({ emitWorkspaceBoardSummariesToUserForHome }) =>
      emitWorkspaceBoardSummariesToUserForHome(workspaceId, input.userId),
    )
    .catch((err) => {
      logger.error({ err, workspaceId, userId: input.userId }, 'Home board fan-out after member add failed');
    });

  emitToUser(input.userId, 'permissions.updated', {
    workspaceId,
    affectedUserIds: [input.userId],
    reason: 'workspace.member.add',
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'workspace.member.add',
    resourceType: 'workspace',
    resourceId: workspaceId,
    metadata: { addedUserId: input.userId, roleKey: input.roleKey },
    timestamp: new Date(),
  });

  await populateWorkspaceMemberListFields(workspace);
  return workspace;
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberUserId: string,
  userId: string
): Promise<(Document & IWorkspace) | null> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return null;
  }

  // Cannot remove owner
  if (workspace.ownerId.toString() === memberUserId) {
    throw new Error('Cannot remove workspace owner');
  }

  if (!(await hasPermission(userId, workspaceId, 'workspaces.members.remove', 'workspace'))) {
    throw new Error('Insufficient permissions to remove members');
  }

  workspace.members = workspace.members.filter(
    (m) => m.userId.toString() !== memberUserId
  );

  await workspace.save();

  emitToWorkspace(workspaceId, 'workspace:updated', {
    workspaceId,
    data: workspace.toObject() as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  });
  void emitWorkspaceHomeAccessRefreshForUser(workspaceId, memberUserId);
  void import('../boardService.js')
    .then(({ emitBoardsHiddenOnHomeAfterWorkspaceRemoval }) =>
      emitBoardsHiddenOnHomeAfterWorkspaceRemoval(workspaceId, memberUserId),
    )
    .catch((err) => {
      logger.error({ err, workspaceId, memberUserId }, 'Home board fan-out after member remove failed');
    });

  emitToUser(memberUserId, 'permissions.updated', {
    workspaceId,
    affectedUserIds: [memberUserId],
    reason: 'workspace.member.remove',
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'workspace.member.remove',
    resourceType: 'workspace',
    resourceId: workspaceId,
    metadata: { removedUserId: memberUserId },
    timestamp: new Date(),
  });

  await populateWorkspaceMemberListFields(workspace);
  return workspace;
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberUserId: string,
  roleKey: string,
  userId: string
): Promise<(Document & IWorkspace) | null> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return null;
  }

  // Cannot change owner role
  if (workspace.ownerId.toString() === memberUserId) {
    throw new Error('Cannot change workspace owner role');
  }

  if (!(await hasPermission(userId, workspaceId, 'workspaces.members.role.update', 'workspace'))) {
    throw new Error('Insufficient permissions to update member roles');
  }

  const member = workspace.members.find((m) => m.userId.toString() === memberUserId);
  if (!member) {
    throw new Error('Member not found');
  }

  const actorRoleKey = workspaceActorRoleKey(workspace, userId);
  if (actorRoleKey == null) {
    throw new Error('Insufficient permissions to update member roles');
  }
  const [actorLevel, targetCurrentLevel, targetNextLevel] = await Promise.all([
    getRoleHierarchyLevel(actorRoleKey),
    getRoleHierarchyLevel(member.roleKey),
    getRoleHierarchyLevel(roleKey),
  ]);
  if (actorLevel == null || targetCurrentLevel == null || targetNextLevel == null) {
    throw new Error('Invalid role hierarchy configuration');
  }
  if (targetCurrentLevel > actorLevel) {
    throw new Error('Cannot update a member with higher hierarchy than your own');
  }
  if (targetNextLevel > actorLevel) {
    throw new Error('Cannot assign a role with higher hierarchy than your own');
  }

  member.roleKey = roleKey;
  await workspace.save();

  emitToWorkspace(workspaceId, 'workspace:updated', {
    workspaceId,
    data: workspace.toObject() as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  });
  emitWorkspaceHomeSnapshotToUser(workspace, memberUserId);

  emitToUser(memberUserId, 'permissions.updated', {
    workspaceId,
    affectedUserIds: [memberUserId],
    reason: 'workspace.member.role.update',
    roleKey,
    serverTs: Date.now(),
  });

  logAuditEvent({
    userId,
    action: 'workspace.member.role.update',
    resourceType: 'workspace',
    resourceId: workspaceId,
    metadata: { memberUserId, roleKey },
    timestamp: new Date(),
  });

  await populateWorkspaceMemberListFields(workspace);
  return workspace;
}

export async function deleteWorkspace(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return false;
  }

  // Only owner can delete
  if (workspace.ownerId.toString() !== userId) {
    throw new Error('Only workspace owner can delete workspace');
  }

  const wsStr = workspace._id.toString();
  const serverTs = Date.now();
  const boards = await Board.find({ workspaceId: workspace._id })
    .select('_id ownerId members')
    .lean();

  emitToWorkspace(wsStr, 'workspace:deleted', { workspaceId: wsStr, serverTs });
  const workspaceNotify = new Set<string>([
    workspace.ownerId.toString(),
    ...workspace.members.map((m) => m.userId.toString()),
  ]);
  for (const uid of workspaceNotify) {
    emitToUser(uid, 'workspace:deleted', { workspaceId: wsStr, serverTs });
  }

  for (const b of boards) {
    const bid = String(b._id);
    emitToBoard(bid, 'board:deleted', { boardId: bid, serverTs });
    emitToWorkspace(wsStr, 'board:deleted', { boardId: bid, serverTs });
    const ownerStr = String(b.ownerId);
    emitToUser(ownerStr, 'board:deleted', { boardId: bid, serverTs });
    const mems = (b.members as Array<{ userId: unknown }> | undefined) ?? [];
    for (const m of mems) {
      const mid = String(m.userId);
      if (mid !== ownerStr) {
        emitToUser(mid, 'board:deleted', { boardId: bid, serverTs });
      }
    }
  }

  const boardObjectIds = boards.map((b) => b._id);
  const { collectImportPlaceholderUserIdsOnBoards, cleanupImportPlaceholderUsersAfterBoardRemoval } =
    await import('../importPlaceholderUserService.js');
  const placeholderUserIds = await collectImportPlaceholderUserIdsOnBoards(boardObjectIds);
  await deleteAllMongoAndStorageForBoardIds(boardObjectIds);
  await deleteWorkspaceScopedMongoRecords(workspace._id, boardObjectIds);

  await Board.deleteMany({ workspaceId: workspace._id });
  await cleanupImportPlaceholderUsersAfterBoardRemoval(placeholderUserIds);
  await User.updateMany({}, { $pull: { 'preferences.homeWorkspaceOrder': workspaceId } });
  const { clearHomeBoardOrderForWorkspaceForAllUsers } = await import('../homeBoardPreferencesService.js');
  await clearHomeBoardOrderForWorkspaceForAllUsers(workspaceId);

  await Workspace.findByIdAndDelete(workspaceId);

  logAuditEvent({
    userId,
    action: 'workspace.delete',
    resourceType: 'workspace',
    resourceId: workspaceId,
    timestamp: new Date(),
  });

  return true;
}


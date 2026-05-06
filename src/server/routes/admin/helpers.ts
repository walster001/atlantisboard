import { Workspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { createActivity } from '../../services/activityService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { emitToAll, emitToUsers } from '../../utils/socketIO.js';

export function emitPermissionsUpdated(input: {
  affectedUserIds: readonly string[];
  reason: string;
  roleKey?: string;
}): void {
  const payload: Record<string, unknown> = {
    affectedUserIds: [...input.affectedUserIds],
    reason: input.reason,
    serverTs: Date.now(),
  };
  if (input.roleKey != null && input.roleKey.trim() !== '') {
    payload.roleKey = input.roleKey;
  }
  if (input.affectedUserIds.length > 0) {
    emitToUsers(input.affectedUserIds, 'permissions.updated', payload);
    return;
  }
  emitToAll('permissions.updated', payload);
}

function appMasterRemovalMessage(targetDisplayName: string): string {
  return `App Master removed ${targetDisplayName}`;
}

export async function removeTargetUserFromWorkspaceMemberships(input: {
  readonly targetUserId: string;
  readonly actingAdminId: string;
  readonly targetDisplayName: string;
  readonly ipAddress: string | undefined;
}): Promise<number> {
  const workspaces = await Workspace.find({ 'members.userId': input.targetUserId })
    .select('_id')
    .lean();
  if (workspaces.length === 0) {
    return 0;
  }

  const message = appMasterRemovalMessage(input.targetDisplayName);
  for (const workspace of workspaces) {
    const workspaceId = String(workspace._id);
    await Workspace.updateOne(
      { _id: workspace._id },
      { $pull: { members: { userId: input.targetUserId } } },
    );
    logAuditEvent({
      userId: input.actingAdminId,
      action: 'workspace.member.remove.app_master',
      resourceType: 'workspace',
      resourceId: workspaceId,
      metadata: {
        removedUserId: input.targetUserId,
        removedDisplayName: input.targetDisplayName,
        message,
      },
      ipAddress: input.ipAddress,
      timestamp: new Date(),
    });
  }
  return workspaces.length;
}

export async function removeTargetUserFromBoardMemberships(input: {
  readonly targetUserId: string;
  readonly actingAdminId: string;
  readonly targetDisplayName: string;
  readonly ipAddress: string | undefined;
}): Promise<number> {
  const boards = await Board.find({ 'members.userId': input.targetUserId })
    .select('_id')
    .lean();
  if (boards.length === 0) {
    return 0;
  }

  const message = appMasterRemovalMessage(input.targetDisplayName);
  for (const board of boards) {
    const boardId = String(board._id);
    await Board.updateOne(
      { _id: board._id },
      { $pull: { members: { userId: input.targetUserId } } },
    );
    logAuditEvent({
      userId: input.actingAdminId,
      action: 'board.member.remove.app_master',
      resourceType: 'board',
      resourceId: boardId,
      metadata: {
        removedUserId: input.targetUserId,
        removedDisplayName: input.targetDisplayName,
        message,
      },
      ipAddress: input.ipAddress,
      timestamp: new Date(),
    });
    createActivity({
      boardId,
      userId: input.actingAdminId,
      type: 'board.member.remove.app_master',
      description: message,
      metadata: {
        targetUserId: input.targetUserId,
        targetDisplayName: input.targetDisplayName,
      },
    });
  }
  return boards.length;
}

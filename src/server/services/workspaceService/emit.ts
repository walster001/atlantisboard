import mongoose, { type Document } from 'mongoose';
import { Workspace, type IWorkspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { emitToUser } from '../../utils/socketIO.js';
import type { WorkspaceSummaryDTO } from '../../../shared/types/viewModels.js';
import { getUserWorkspaces } from './crud.js';
import {
  toBoardOnlyWorkspaceSummary,
  toWorkspaceSummary,
  workspaceRefUserId,
} from './typesAndHelpers.js';

/**
 * Push a workspace row to one user's home list (Dexie + React) when they gain board/workspace access
 * but are not in `workspace:*` rooms yet — mirrors GET /workspaces summary shape.
 */
export function emitWorkspaceHomeSnapshotToUser(
  workspace: Document & IWorkspace,
  userId: string,
): void {
  const workspaceId = workspace._id.toString();
  const isMember =
    workspace.ownerId.toString() === userId ||
    workspace.members.some((m) => m.userId.toString() === userId);
  const summary = isMember
    ? toWorkspaceSummary(workspace)
    : toBoardOnlyWorkspaceSummary(workspace);
  emitToUser(userId, 'workspace:updated', {
    workspaceId,
    data: summary as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  });
}

export async function emitWorkspaceHomeSnapshotToUserById(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return;
  }
  emitWorkspaceHomeSnapshotToUser(workspace, userId);
}

/**
 * Fan-out workspace title/description (etc.) to users who have boards here but are not workspace
 * owner/members — they do not join `workspace:*` rooms, so they miss `emitToWorkspace` otherwise.
 */
export async function emitWorkspaceUpdatedToBoardScopedUsers(
  workspace: Document & IWorkspace,
): Promise<void> {
  const memberIdSet = new Set<string>();
  const ownerStr = workspaceRefUserId(workspace.ownerId);
  if (ownerStr !== '') {
    memberIdSet.add(ownerStr);
  }
  for (const m of workspace.members) {
    const uid = workspaceRefUserId(m.userId);
    if (uid !== '') {
      memberIdSet.add(uid);
    }
  }

  const boards = await Board.find({ workspaceId: workspace._id })
    .select('ownerId members.userId')
    .lean();

  const notified = new Set<string>();
  for (const b of boards) {
    const bo = b as { ownerId?: unknown; members?: ReadonlyArray<{ userId?: unknown }> };
    const boardOwner = workspaceRefUserId(bo.ownerId);
    if (boardOwner !== '' && !memberIdSet.has(boardOwner) && !notified.has(boardOwner)) {
      notified.add(boardOwner);
      emitWorkspaceHomeSnapshotToUser(workspace, boardOwner);
    }
    for (const m of bo.members ?? []) {
      const mid = workspaceRefUserId(m.userId);
      if (mid !== '' && !memberIdSet.has(mid) && !notified.has(mid)) {
        notified.add(mid);
        emitWorkspaceHomeSnapshotToUser(workspace, mid);
      }
    }
  }
}

export async function emitWorkspaceUpdatedToBoardScopedUsersById(workspaceId: string): Promise<void> {
  const workspace = await Workspace.findById(workspaceId);
  if (workspace == null) {
    return;
  }
  await emitWorkspaceUpdatedToBoardScopedUsers(workspace);
}

/** Owner + workspace members — same audience that sees the full workspace row on home. */
export async function getWorkspaceOwnerAndMemberUserIds(workspaceId: string): Promise<readonly string[]> {
  type LeanWs = {
    ownerId: mongoose.Types.ObjectId;
    members?: ReadonlyArray<{ userId: mongoose.Types.ObjectId }>;
  };
  const workspace = await Workspace.findById(workspaceId).select('ownerId members.userId').lean<LeanWs>();
  if (workspace == null) {
    return [];
  }
  const ids = new Set<string>();
  ids.add(workspace.ownerId.toString());
  for (const m of workspace.members ?? []) {
    ids.add(m.userId.toString());
  }
  return [...ids];
}

/**
 * Reconcile home workspace row for a user: after workspace membership changes, or when they lose
 * board-only access (e.g. removed from their last board in that workspace). Either push an updated
 * summary or `workspace:deleted` if they no longer see the workspace in `getUserWorkspaces`.
 */
export async function emitWorkspaceHomeAccessRefreshForUser(
  workspaceId: string,
  affectedUserId: string,
): Promise<void> {
  const summaries = await getUserWorkspaces(affectedUserId, { view: 'summary' });
  const idOf = (w: (Document & IWorkspace) | WorkspaceSummaryDTO): string => {
    if ('id' in w) {
      const summary = w as WorkspaceSummaryDTO;
      if (summary.id.trim() !== '') {
        return summary.id;
      }
    }
    return (w as Document & IWorkspace)._id.toString();
  };
  const stillVisible = summaries.some((w) => idOf(w) === workspaceId);
  const workspaceDoc = await Workspace.findById(workspaceId);
  if (!workspaceDoc) {
    return;
  }
  if (stillVisible) {
    emitWorkspaceHomeSnapshotToUser(workspaceDoc, affectedUserId);
  } else {
    emitToUser(affectedUserId, 'workspace:deleted', { workspaceId, serverTs: Date.now() });
  }
}

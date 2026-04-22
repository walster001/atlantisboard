import mongoose from 'mongoose';
import { Workspace, type IWorkspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import {
  deleteAllMongoAndStorageForBoardIds,
  deleteWorkspaceScopedMongoRecords,
} from './boardScopedDeletion.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import type { Document } from 'mongoose';
import type { WorkspaceSummaryDTO } from '../../shared/types/viewModels.js';
import { emitToBoard, emitToUser, emitToWorkspace } from '../utils/socketIO.js';
import { hasPermission } from '../utils/permissions.js';
import { getRoleHierarchyLevel } from './roleService.js';

export interface CreateWorkspaceInput {
  name: string;
  description?: string | undefined;
  ownerId: string;
}

export interface UpdateWorkspaceInput {
  name?: string | undefined;
  description?: string | undefined;
  activityLogRetentionDays?: number | undefined;
}

export interface AddMemberInput {
  userId: string;
  roleKey: string;
}

export type WorkspaceViewMode = 'summary' | 'detail';

/** Matches `getWorkspaceById` detail view — mutation responses must not return raw ObjectIds for member list UI. */
const WORKSPACE_MEMBER_LIST_POPULATE: readonly mongoose.PopulateOptions[] = [
  { path: 'ownerId', select: 'displayName email profilePicture' },
  { path: 'members.userId', select: 'displayName email profilePicture' },
];

async function populateWorkspaceMemberListFields(workspace: Document & IWorkspace): Promise<void> {
  await workspace.populate([...WORKSPACE_MEMBER_LIST_POPULATE]);
}

/**
 * Resolves a workspace owner/member ref to a string user id after `populate()`.
 * Populated user docs must use `_id`, not `ref.toString()` (unreliable for plain objects).
 */
function workspaceRefUserId(ref: unknown): string {
  if (ref == null) {
    return '';
  }
  if (typeof ref === 'string') {
    return ref;
  }
  if (typeof ref === 'number' && Number.isFinite(ref)) {
    return String(ref);
  }
  if (typeof ref === 'object' && ref !== null) {
    const o = ref as Record<string, unknown>;
    if (o._id != null) {
      return typeof o._id === 'string' ? o._id : String(o._id);
    }
    if (typeof o.id === 'string' && o.id.trim() !== '') {
      return o.id;
    }
  }
  if (typeof ref === 'object' && ref !== null && 'toString' in ref) {
    const s = (ref as { toString: () => string }).toString();
    if (typeof s === 'string' && s !== '' && s !== '[object Object]') {
      return s;
    }
  }
  return '';
}

function workspaceActorRoleKey(workspace: Document & IWorkspace, userId: string): string | null {
  if (workspace.ownerId.toString() === userId) {
    return 'admin';
  }
  const member = workspace.members.find((m) => m.userId.toString() === userId);
  if (member == null || member.roleKey.trim() === '') {
    return null;
  }
  return member.roleKey;
}

function toWorkspaceSummary(workspace: Document & IWorkspace): WorkspaceSummaryDTO {
  return {
    id: workspace._id.toString(),
    name: workspace.name,
    ...(workspace.description !== undefined ? { description: workspace.description } : {}),
    ownerId: workspace.ownerId.toString(),
    members: workspace.members.map((member) => ({
      userId: member.userId.toString(),
      roleKey: member.roleKey,
      joinedAt: member.joinedAt,
    })),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/** Home list only: title/description for board access without workspace membership (no members payload). */
function toBoardOnlyWorkspaceSummary(workspace: Document & IWorkspace): WorkspaceSummaryDTO {
  return {
    id: workspace._id.toString(),
    name: workspace.name,
    ...(workspace.description !== undefined ? { description: workspace.description } : {}),
    ownerId: workspace.ownerId.toString(),
    boardScopedHomeOnly: true,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

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
  const idOf = (w: unknown): string => {
    const o = w as { id?: string; _id?: { toString(): string } };
    if (typeof o.id === 'string' && o.id.trim() !== '') {
      return o.id;
    }
    if (o._id != null) {
      return typeof o._id === 'string' ? o._id : o._id.toString();
    }
    return '';
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

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Document & IWorkspace> {
  const workspace = new Workspace({
    name: input.name,
    description: input.description,
    ownerId: input.ownerId,
    members: [],
  });

  await workspace.save();

  const wsId = workspace._id.toString();
  const wsPayload = {
    workspaceId: wsId,
    data: workspace.toObject() as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  };
  emitToWorkspace(wsId, 'workspace:created', wsPayload);
  emitToUser(input.ownerId, 'workspace:created', wsPayload);

  logAuditEvent({
    userId: input.ownerId,
    action: 'workspace.create',
    resourceType: 'workspace',
    resourceId: workspace._id.toString(),
    timestamp: new Date(),
  });

  logger.info({ workspaceId: workspace._id.toString(), ownerId: input.ownerId }, 'Workspace created');
  return workspace;
}

export async function getWorkspaceById(
  workspaceId: string,
  userId: string,
  options?: { view?: WorkspaceViewMode }
): Promise<((Document & IWorkspace) | WorkspaceSummaryDTO) | null> {
  const view = options?.view ?? 'detail';
  const workspaceQuery = Workspace.findById(workspaceId);
  if (view === 'detail') {
    workspaceQuery.populate([...WORKSPACE_MEMBER_LIST_POPULATE]);
  }
  const workspace = await workspaceQuery;
  if (!workspace) {
    return null;
  }

  // Check access
  if (workspaceRefUserId(workspace.ownerId) === userId) {
    return view === 'summary' ? toWorkspaceSummary(workspace) : workspace;
  }

  if (workspace.members.some((m) => workspaceRefUserId(m.userId) === userId)) {
    return view === 'summary' ? toWorkspaceSummary(workspace) : workspace;
  }

  // Board-only access does not grant workspace scope (no member list, no other boards).
  return null;
}

export async function getUserWorkspaces(
  userId: string,
  options?: { view?: WorkspaceViewMode }
): Promise<Array<(Document & IWorkspace) | WorkspaceSummaryDTO>> {
  const memberWorkspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).sort({ createdAt: -1 });

  const memberIdSet = new Set(memberWorkspaces.map((w) => w._id.toString()));

  const boardWorkspaceRefs = await Board.distinct('workspaceId', {
    workspaceId: { $exists: true, $nin: [null] },
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).catch((): unknown[] => []);

  const boardOnlyWorkspaceIdStrings = Array.from(
    new Set(
      boardWorkspaceRefs
        .map((ref) => {
          if (ref == null) {
            return '';
          }
          if (typeof ref === 'string') {
            return ref.trim();
          }
          return String(ref);
        })
        .filter((id) => id !== '' && mongoose.Types.ObjectId.isValid(id))
        .filter((id) => !memberIdSet.has(id)),
    ),
  );

  const boardOnlyDocs =
    boardOnlyWorkspaceIdStrings.length === 0
      ? []
      : await Workspace.find({
          _id: {
            $in: boardOnlyWorkspaceIdStrings.map((id) => new mongoose.Types.ObjectId(id)),
          },
        }).sort({ createdAt: -1 });

  const ordered: Array<Document & IWorkspace> = [];
  const seen = new Set<string>();
  for (const w of memberWorkspaces) {
    const id = w._id.toString();
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(w);
    }
  }
  for (const w of boardOnlyDocs) {
    const id = w._id.toString();
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(w);
    }
  }

  const view = options?.view;
  if (view === 'summary') {
    return ordered.map((workspace) =>
      memberIdSet.has(workspace._id.toString())
        ? toWorkspaceSummary(workspace)
        : toBoardOnlyWorkspaceSummary(workspace),
    );
  }

  return ordered.map((workspace) =>
    memberIdSet.has(workspace._id.toString()) ? workspace : toBoardOnlyWorkspaceSummary(workspace),
  );
}

function workspaceSummaryDtoId(w: unknown): string {
  const o = w as { id?: string };
  return typeof o.id === 'string' && o.id.trim() !== '' ? o.id.trim() : '';
}

/**
 * Keep only workspace ids the user may see, preserve client order, append any newly visible rows in default order.
 */
export async function sanitizeAndMergeHomeWorkspaceOrder(
  userId: string,
  requestedOrder: readonly string[],
): Promise<string[]> {
  const visible = await getUserWorkspaces(userId, { view: 'summary' });
  const visibleIds: string[] = [];
  for (const w of visible) {
    const id = workspaceSummaryDtoId(w);
    if (id !== '') {
      visibleIds.push(id);
    }
  }
  const visibleSet = new Set(visibleIds);
  const filtered = requestedOrder
    .map((x) => x.trim())
    .filter((id) => id !== '' && visibleSet.has(id));
  const seen = new Set(filtered);
  const tail = visibleIds.filter((id) => !seen.has(id));
  return [...filtered, ...tail];
}

export async function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
  userId: string
): Promise<(Document & IWorkspace) | null> {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return null;
  }

  if (!(await hasPermission(userId, workspaceId, 'workspaces.update', 'workspace'))) {
    throw new Error('Insufficient permissions to update workspace');
  }

  if (input.name !== undefined) workspace.name = input.name;
  if (input.description !== undefined) workspace.description = input.description;
  if (input.activityLogRetentionDays !== undefined) {
    workspace.activityLogRetentionDays = input.activityLogRetentionDays;
  }

  await workspace.save();

  emitToWorkspace(workspaceId, 'workspace:updated', {
    workspaceId,
    data: workspace.toObject() as unknown as Record<string, unknown>,
    serverTs: Date.now(),
  });
  void emitWorkspaceUpdatedToBoardScopedUsers(workspace);

  logAuditEvent({
    userId,
    action: 'workspace.update',
    resourceType: 'workspace',
    resourceId: workspaceId,
    timestamp: new Date(),
  });

  return workspace;
}

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
  void import('./boardService.js')
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
  void import('./boardService.js')
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
  await deleteAllMongoAndStorageForBoardIds(boardObjectIds);
  await deleteWorkspaceScopedMongoRecords(workspace._id, boardObjectIds);

  await Board.deleteMany({ workspaceId: workspace._id });

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


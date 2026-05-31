import mongoose, { type Document } from 'mongoose';
import { Workspace, type IWorkspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { logger } from '../../utils/logger.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import type { WorkspaceSummaryDTO } from '../../../shared/types/viewModels.js';
import { emitToUser, emitToWorkspace } from '../../utils/socketIO.js';
import { hasPermission } from '../../utils/permissions.js';
import {
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type WorkspaceViewMode,
  WORKSPACE_MEMBER_LIST_POPULATE,
  toBoardOnlyWorkspaceSummary,
  toWorkspaceSummary,
  workspaceRefUserId,
  buildWorkspaceRealtimePayload,
} from './typesAndHelpers.js';
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Document & IWorkspace> {
  const workspace = new Workspace({
    name: input.name,
    description: input.description,
    ownerId: input.ownerId,
    members: [],
  });

  await workspace.save();

  const wsId = workspace._id.toString();
  const wsPayload = buildWorkspaceRealtimePayload(workspace);
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
  const o = w as { id?: unknown; _id?: unknown };
  if (typeof o.id === 'string' && o.id.trim() !== '') {
    return o.id.trim();
  }
  if (o._id != null) {
    if (typeof o._id === 'string' && o._id.trim() !== '') {
      return o._id.trim();
    }
    if (typeof o._id === 'object' && o._id !== null && 'toString' in (o._id as object)) {
      const s = (o._id as { toString(): string }).toString();
      if (typeof s === 'string' && s !== '' && s !== '[object Object]') {
        return s;
      }
    }
  }
  return '';
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

  emitToWorkspace(workspaceId, 'workspace:updated', buildWorkspaceRealtimePayload(workspace));
  void import('./emit.js').then(({ emitWorkspaceUpdatedToBoardScopedUsers }) =>
    emitWorkspaceUpdatedToBoardScopedUsers(workspace),
  );

  logAuditEvent({
    userId,
    action: 'workspace.update',
    resourceType: 'workspace',
    resourceId: workspaceId,
    timestamp: new Date(),
  });

  return workspace;
}


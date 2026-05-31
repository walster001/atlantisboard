import mongoose from 'mongoose';
import type { Document } from 'mongoose';
import type { IWorkspace } from '../../models/Workspace.js';
import type { WorkspaceSummaryDTO } from '../../../shared/types/viewModels.js';

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
export const WORKSPACE_MEMBER_LIST_POPULATE: readonly mongoose.PopulateOptions[] = [
  { path: 'ownerId', select: 'displayName email profilePicture' },
  { path: 'members.userId', select: 'displayName email profilePicture' },
];

export async function populateWorkspaceMemberListFields(workspace: Document & IWorkspace): Promise<void> {
  await workspace.populate([...WORKSPACE_MEMBER_LIST_POPULATE]);
}

/**
 * Resolves a workspace owner/member ref to a string user id after `populate()`.
 * Populated user docs must use `_id`, not `ref.toString()` (unreliable for plain objects).
 */
export function workspaceRefUserId(ref: unknown): string {
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

export function workspaceActorRoleKey(workspace: Document & IWorkspace, userId: string): string | null {
  if (workspace.ownerId.toString() === userId) {
    return 'admin';
  }
  const member = workspace.members.find((m) => m.userId.toString() === userId);
  if (member == null || member.roleKey.trim() === '') {
    return null;
  }
  return member.roleKey;
}

export function toWorkspaceSummary(workspace: Document & IWorkspace): WorkspaceSummaryDTO {
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
export function toBoardOnlyWorkspaceSummary(workspace: Document & IWorkspace): WorkspaceSummaryDTO {
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

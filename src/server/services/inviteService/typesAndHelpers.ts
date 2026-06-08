import type { InviteType, InviteLinkType } from '../../models/InviteLink.js';
import { Workspace, type IWorkspace } from '../../models/Workspace.js';
import { hasPermission } from '../../utils/permissions.js';
import {
  type BoardMemberRoleUpdateModeKey,
  validateRoleKeyExists,
} from '../roleService.js';
import type { IBoard } from '../../models/Board.js';

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

export function uniqueUserIds(ids: readonly string[]): string[] {
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

export async function validateRoleKeyForInvite(roleKey: string): Promise<void> {
  await validateRoleKeyExists(roleKey);
}

export function resolveWorkspaceRoleKeyForUser(
  workspace: Pick<IWorkspace, 'ownerId' | 'members'>,
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

export async function resolveBoardRoleKeyForUser(
  board: Pick<IBoard, 'ownerId' | 'workspaceId' | 'members'>,
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
  const wsMember = workspace.members.find((m) => m.userId.toString() === userId);
  return wsMember != null && wsMember.roleKey.trim() !== '' ? wsMember.roleKey.trim() : null;
}

export async function resolveBoardRoleUpdateModeForActor(
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

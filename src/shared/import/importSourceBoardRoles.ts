import type { ImportSourceRoleMapping } from './importPreflight.js';
import {
  mapWekanBoardMemberToBoardRoleKey,
  type WekanImportedBoardMember,
} from './wekanBoardMemberRoleMap.js';
import { mapTrelloBoardMemberToBoardRoleKey } from './trelloBoardMemberRoles.js';

/** Implicit Wekan role for card assignees not listed on board.members. */
export const WEKAN_IMPLICIT_MEMBER_SOURCE_ROLE = 'normal' as const;

/** Default Trello role when exports omit memberships (card assignees only). */
export const TRELLO_DEFAULT_MEMBER_SOURCE_ROLE = 'member' as const;

const WEKAN_SOURCE_ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: 'Admin',
  'comment-only': 'Comment only',
  'no-comments': 'No comments',
  worker: 'Worker',
  'read-only': 'Read only',
  'read-assigned-only': 'Read assigned only',
  'comment-assigned-only': 'Comment assigned only',
  'normal-assigned-only': 'Normal assigned only',
  normal: 'Normal member',
};

const TRELLO_SOURCE_ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: 'Admin',
  normal: 'Normal member',
  member: 'Member',
  observer: 'Observer',
  guest: 'Guest',
};

function normalizePermissionToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readWekanMemberRecord(member: unknown): WekanImportedBoardMember | null {
  const record = asRecord(member);
  if (record == null) {
    return null;
  }
  return {
    isAdmin: record.isAdmin === true,
    ...(record.isCommentOnly === true ? { isCommentOnly: true } : {}),
    ...(record.isNoComments === true ? { isNoComments: true } : {}),
    ...(record.isWorker === true ? { isWorker: true } : {}),
    ...(record.isReadOnly === true ? { isReadOnly: true } : {}),
    ...(record.isReadAssignedOnly === true ? { isReadAssignedOnly: true } : {}),
    ...(record.isNormalAssignedOnly === true ? { isNormalAssignedOnly: true } : {}),
    ...(record.isCommentAssignedOnly === true ? { isCommentAssignedOnly: true } : {}),
    ...(typeof record.permission === 'string' && record.permission.trim() !== ''
      ? { permission: record.permission.trim() }
      : {}),
  };
}

/** Stable source role key for a Wekan board member (used in import role mapping). */
export function deriveWekanMemberSourceRoleKey(member: WekanImportedBoardMember): string {
  if (member.isAdmin === true) {
    return 'admin';
  }
  if (member.isCommentOnly === true) {
    return 'comment-only';
  }
  if (member.isNoComments === true) {
    return 'no-comments';
  }
  if (member.isWorker === true) {
    return 'worker';
  }
  if (member.isReadOnly === true) {
    return 'read-only';
  }
  if (member.isReadAssignedOnly === true) {
    return 'read-assigned-only';
  }
  if (member.isCommentAssignedOnly === true) {
    return 'comment-assigned-only';
  }
  if (member.isNormalAssignedOnly === true) {
    return 'normal-assigned-only';
  }

  const permRaw = member.permission;
  if (typeof permRaw === 'string' && permRaw.trim() !== '') {
    return normalizePermissionToken(permRaw);
  }

  return WEKAN_IMPLICIT_MEMBER_SOURCE_ROLE;
}

export function defaultWekanBoardRoleKeyForSourceRole(sourceRoleKey: string): 'manager' | 'viewer' {
  if (sourceRoleKey === 'admin') {
    return 'manager';
  }
  return mapWekanBoardMemberToBoardRoleKey({ isAdmin: false });
}

export function defaultTrelloBoardRoleKeyForSourceRole(sourceRoleKey: string): 'manager' | 'viewer' {
  const normalized = sourceRoleKey.trim().toLowerCase();
  return mapTrelloBoardMemberToBoardRoleKey({ memberType: normalized });
}

export function resolveImportBoardRoleFromSourceMapping(
  sourceRoleKey: string,
  mappings: readonly ImportSourceRoleMapping[] | undefined,
  defaultRoleKey: string,
): string {
  const trimmed = sourceRoleKey.trim();
  const mapping = mappings?.find((entry) => entry.sourceRoleKey === trimmed);
  const target = mapping?.targetRoleKey.trim();
  return target != null && target !== '' ? target : defaultRoleKey;
}

export function formatImportSourceRoleLabel(
  source: 'wekan' | 'trello',
  sourceRoleKey: string,
): string {
  const labels = source === 'wekan' ? WEKAN_SOURCE_ROLE_LABELS : TRELLO_SOURCE_ROLE_LABELS;
  return labels[sourceRoleKey] ?? sourceRoleKey;
}

function collectWekanBoardsFromRaw(raw: unknown): readonly Record<string, unknown>[] {
  const root = asRecord(raw);
  if (root == null) {
    return [];
  }
  const dataObj = asRecord(root.data);
  if (dataObj != null) {
    return collectWekanBoardsFromRaw(dataObj);
  }
  const boardObj = asRecord(root.board);
  if (boardObj != null && !Array.isArray(root.boards)) {
    return [boardObj];
  }
  if (Array.isArray(root.boards)) {
    return root.boards.flatMap((board) => {
      const record = asRecord(board);
      return record != null ? [record] : [];
    });
  }
  if (typeof root._id === 'string' && (Array.isArray(root.lists) || Array.isArray(root.cards))) {
    const boardRecord: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(root)) {
      if (!['lists', 'cards', 'labels', 'checklists', 'comments', 'attachments', 'users'].includes(key)) {
        boardRecord[key] = value;
      }
    }
    return [boardRecord];
  }
  return [];
}

/** Distinct Wekan permission/role keys found in board.members across the export file. */
export function extractDistinctWekanSourceBoardRoles(raw: unknown): readonly string[] {
  const roles = new Set<string>();
  for (const board of collectWekanBoardsFromRaw(raw)) {
    const members = board.members;
    if (!Array.isArray(members)) {
      continue;
    }
    for (const member of members) {
      const parsed = readWekanMemberRecord(member);
      if (parsed != null) {
        roles.add(deriveWekanMemberSourceRoleKey(parsed));
      }
    }
  }
  roles.add(WEKAN_IMPLICIT_MEMBER_SOURCE_ROLE);
  return [...roles].sort((a, b) => a.localeCompare(b));
}

function readTrelloMembershipMemberType(membership: unknown): string | undefined {
  const record = asRecord(membership);
  if (record == null) {
    return undefined;
  }
  const memberType =
    typeof record.memberType === 'string'
      ? record.memberType.trim().toLowerCase()
      : typeof record.deactivated === 'boolean' && record.deactivated
        ? undefined
        : undefined;
  return memberType != null && memberType !== '' ? memberType : undefined;
}

/** Distinct Trello memberType values from memberships[] (plus default member). */
export function extractDistinctTrelloSourceBoardRoles(raw: unknown): readonly string[] {
  const roles = new Set<string>([TRELLO_DEFAULT_MEMBER_SOURCE_ROLE]);
  const root = asRecord(raw);
  if (root == null) {
    return [...roles].sort((a, b) => a.localeCompare(b));
  }
  const memberships = root.memberships;
  if (!Array.isArray(memberships)) {
    return [...roles].sort((a, b) => a.localeCompare(b));
  }
  for (const membership of memberships) {
    const memberType = readTrelloMembershipMemberType(membership);
    if (memberType != null) {
      roles.add(memberType === 'normal' ? TRELLO_DEFAULT_MEMBER_SOURCE_ROLE : memberType);
    }
  }
  return [...roles].sort((a, b) => a.localeCompare(b));
}

export function buildDefaultImportSourceRoleMappings(
  source: 'wekan' | 'trello',
  sourceRoles: readonly string[],
): ImportSourceRoleMapping[] {
  return sourceRoles.map((sourceRoleKey) => ({
    sourceRoleKey,
    targetRoleKey:
      source === 'wekan'
        ? defaultWekanBoardRoleKeyForSourceRole(sourceRoleKey)
        : defaultTrelloBoardRoleKeyForSourceRole(sourceRoleKey),
  }));
}

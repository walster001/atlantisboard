/**
 * Maps Wekan board member access to KanBoard built-in board roles on import.
 *
 * Wekan stores per-member flags (`isAdmin`, `isCommentOnly`, …) on `board.members[]`.
 * Some exports may also carry a string `permission` — we normalize common spellings.
 *
 * @see https://github.com/wekan/wekan/blob/main/models/boards.js (members.$ schema)
 */
export type WekanImportedBoardMember = Readonly<{
  readonly isAdmin: boolean;
  readonly isCommentOnly?: boolean | undefined;
  readonly isNoComments?: boolean | undefined;
  readonly isWorker?: boolean | undefined;
  readonly isReadOnly?: boolean | undefined;
  readonly isReadAssignedOnly?: boolean | undefined;
  readonly isNormalAssignedOnly?: boolean | undefined;
  readonly isCommentAssignedOnly?: boolean | undefined;
  /** Rare in core Wekan; supported if present on exported JSON. */
  readonly permission?: string | undefined;
}>;

function normalizeWekanMemberPermissionToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Board role for an imported Wekan member (importer is always added separately as `admin`).
 */
export function mapWekanBoardMemberToBoardRoleKey(
  member: WekanImportedBoardMember,
): 'manager' | 'viewer' {
  if (member.isAdmin === true) {
    return 'manager';
  }

  if (member.isCommentOnly === true) {
    return 'viewer';
  }
  if (member.isNoComments === true) {
    return 'viewer';
  }
  if (member.isWorker === true) {
    return 'viewer';
  }
  if (member.isReadOnly === true || member.isReadAssignedOnly === true) {
    return 'viewer';
  }
  if (member.isCommentAssignedOnly === true) {
    return 'viewer';
  }
  if (member.isNormalAssignedOnly === true) {
    return 'manager';
  }

  const permRaw = member.permission;
  if (typeof permRaw === 'string' && permRaw.trim() !== '') {
    const p = normalizeWekanMemberPermissionToken(permRaw);
    if (p === 'commentsonly' || p === 'commentonly') {
      return 'viewer';
    }
    if (p === 'nocomments') {
      return 'viewer';
    }
    if (p === 'admin') {
      return 'manager';
    }
    if (p === 'worker') {
      return 'viewer';
    }
    if (p === 'normal') {
      return 'manager';
    }
    if (p === 'readonly' || p === 'readassignedonly') {
      return 'viewer';
    }
    if (p === 'commentassignedonly') {
      return 'viewer';
    }
    if (p === 'normalassignedonly') {
      return 'manager';
    }
  }

  return 'manager';
}

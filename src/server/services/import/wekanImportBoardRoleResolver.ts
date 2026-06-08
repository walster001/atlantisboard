import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import {
  deriveWekanMemberSourceRoleKey,
  resolveImportBoardRoleFromSourceMapping,
  WEKAN_IMPLICIT_MEMBER_SOURCE_ROLE,
} from '../../../shared/import/importSourceBoardRoles.js';
import {
  mapWekanBoardMemberToBoardRoleKey,
  type WekanImportedBoardMember,
} from '../../../shared/import/wekanBoardMemberRoleMap.js';
import type { WekanBoard } from './wekanImportService/types.js';

function wekanMemberToImportedShape(
  member: NonNullable<WekanBoard['members']>[number],
): WekanImportedBoardMember {
  return {
    isAdmin: member.isAdmin,
    ...(member.isCommentOnly ? { isCommentOnly: true } : {}),
    ...(member.isNoComments ? { isNoComments: true } : {}),
    ...(member.isWorker ? { isWorker: true } : {}),
    ...(member.isReadOnly ? { isReadOnly: true } : {}),
    ...(member.isReadAssignedOnly ? { isReadAssignedOnly: true } : {}),
    ...(member.isNormalAssignedOnly ? { isNormalAssignedOnly: true } : {}),
    ...(member.isCommentAssignedOnly ? { isCommentAssignedOnly: true } : {}),
    ...(member.permission != null && member.permission.trim() !== '' ? { permission: member.permission } : {}),
  };
}

export function buildWekanImportBoardRoleResolver(
  wekanBoard: WekanBoard,
  preflight: ImportPreflightPayloadParsed | undefined,
): (sourceUserId: string) => string {
  const memberByUserId = new Map(
    (wekanBoard.members ?? []).map((member) => [member.userId.trim(), member] as const),
  );

  return (sourceUserId: string) => {
    const trimmed = sourceUserId.trim();
    const member = memberByUserId.get(trimmed);
    const importedShape = member != null ? wekanMemberToImportedShape(member) : null;
    const sourceRoleKey =
      importedShape != null
        ? deriveWekanMemberSourceRoleKey(importedShape)
        : WEKAN_IMPLICIT_MEMBER_SOURCE_ROLE;
    const defaultRoleKey =
      importedShape != null ? mapWekanBoardMemberToBoardRoleKey(importedShape) : 'viewer';
    return resolveImportBoardRoleFromSourceMapping(
      sourceRoleKey,
      preflight?.sourceRoleMappings,
      defaultRoleKey,
    );
  };
}

import type { ImportPreflightPayloadParsed } from '../../../shared/import/importPreflightSchema.js';
import {
  resolveImportBoardRoleFromSourceMapping,
  TRELLO_DEFAULT_MEMBER_SOURCE_ROLE,
} from '../../../shared/import/importSourceBoardRoles.js';
import { mapTrelloBoardMemberToBoardRoleKey } from '../../../shared/import/trelloBoardMemberRoles.js';
import { objectToRecord } from '../../utils/objectRecord.js';

function readTrelloMemberType(membership: Record<string, unknown>): string {
  const memberType =
    typeof membership.memberType === 'string' ? membership.memberType.trim().toLowerCase() : '';
  if (memberType === '' || memberType === 'normal') {
    return TRELLO_DEFAULT_MEMBER_SOURCE_ROLE;
  }
  return memberType;
}

/** memberId → source role key for one Trello board (from root memberships[] when present). */
export function buildTrelloMemberSourceRoleByMemberId(
  boardId: string,
  jsonData: unknown,
): ReadonlyMap<string, string> {
  if (jsonData == null || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
    return new Map();
  }
  const root = objectToRecord(jsonData);
  const memberships = root?.memberships;
  if (!Array.isArray(memberships)) {
    return new Map();
  }

  const map = new Map<string, string>();
  for (const entry of memberships) {
    const record = objectToRecord(entry);
    if (record == null) {
      continue;
    }
    const idBoard = typeof record.idBoard === 'string' ? record.idBoard.trim() : '';
    if (idBoard !== boardId) {
      continue;
    }
    const idMember =
      typeof record.idMember === 'string'
        ? record.idMember.trim()
        : typeof record.id === 'string'
          ? record.id.trim()
          : '';
    if (idMember === '') {
      continue;
    }
    map.set(idMember, readTrelloMemberType(record));
  }
  return map;
}

export function buildTrelloImportBoardRoleResolver(
  boardId: string,
  jsonData: unknown,
  preflight: ImportPreflightPayloadParsed | undefined,
): (sourceUserId: string) => string {
  const sourceRoleByMemberId = buildTrelloMemberSourceRoleByMemberId(boardId, jsonData);

  return (sourceUserId: string) => {
    const trimmed = sourceUserId.trim();
    const sourceRoleKey = sourceRoleByMemberId.get(trimmed) ?? TRELLO_DEFAULT_MEMBER_SOURCE_ROLE;
    const defaultRoleKey = mapTrelloBoardMemberToBoardRoleKey({ memberType: sourceRoleKey });
    return resolveImportBoardRoleFromSourceMapping(
      sourceRoleKey,
      preflight?.sourceRoleMappings,
      defaultRoleKey,
    );
  };
}

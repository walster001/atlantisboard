import { type RoleKey } from '../../../shared/permissions/catalog.js';
import {
  extractUser,
  memberPanelRowMatchesRoleFilter,
  mergeBoardMembersByUserId,
  sortBoardMembersByDisplayName,
  type BoardMemberListItem,
  type BoardPayload,
  type MemberPanelRow,
} from '../../components/board/BoardMemberTableParts.js';
import { compareUserRowsByDisplayName } from '../members/memberDirectoryUtils.js';

export function buildBoardPayloadFromMemberRows(rows: BoardMemberListItem[]): BoardPayload {
  const ownerRow = rows.find((row) => row.role === 'owner');
  const memberRows = rows.filter((row) => row.role !== 'owner');
  return {
    ...(ownerRow !== undefined
      ? {
          ownerId: {
            _id: ownerRow.userId,
            displayName: ownerRow.displayName,
            email: ownerRow.email,
            ...(ownerRow.profilePicture !== undefined
              ? { profilePicture: ownerRow.profilePicture }
              : {}),
            ...(ownerRow.importPlaceholder === true
              ? { importPlaceholder: true, importNotMapped: ownerRow.importNotMapped === true }
              : {}),
          },
        }
      : {}),
    members: memberRows.map((row) => ({
      userId: {
        _id: row.userId,
        displayName: row.displayName,
        email: row.email,
        ...(row.profilePicture !== undefined ? { profilePicture: row.profilePicture } : {}),
        ...(row.importPlaceholder === true
          ? { importPlaceholder: true, importNotMapped: row.importNotMapped === true }
          : {}),
      },
      roleKey: row.roleKey as RoleKey,
    })),
  };
}

export function mergeBoardPayloadWithPage(
  prev: BoardPayload | null,
  next: BoardPayload,
  cursor: string | undefined,
): BoardPayload {
  if (cursor === undefined || prev === null) {
    return next;
  }
  const ownerId = next.ownerId !== undefined ? next.ownerId : prev.ownerId;
  return {
    ...(ownerId !== undefined ? { ownerId } : {}),
    members: sortBoardMembersByDisplayName(
      mergeBoardMembersByUserId(prev.members ?? [], next.members ?? []),
    ),
  };
}

export function buildSortedMemberPanelRows(
  board: BoardPayload | null,
  owner: ReturnType<typeof extractUser> | null,
): MemberPanelRow[] {
  const members = board?.members ?? [];
  const rows: MemberPanelRow[] = [];
  if (owner !== null && owner.importPlaceholder !== true) {
    rows.push({ kind: 'owner', user: owner });
  }
  for (const m of members) {
    const memberUser = extractUser(m.userId);
    if (memberUser.importPlaceholder === true) {
      continue;
    }
    rows.push({ kind: 'member', member: m });
  }
  rows.sort((a, b) => {
    const ua = a.kind === 'owner' ? a.user : extractUser(a.member.userId);
    const ub = b.kind === 'owner' ? b.user : extractUser(b.member.userId);
    return compareUserRowsByDisplayName(ua, ub);
  });
  return rows;
}

export function filterMemberPanelRowsByRole(
  rows: MemberPanelRow[],
  memberRoleFilter: RoleKey | null,
): MemberPanelRow[] {
  if (memberRoleFilter == null) {
    return rows;
  }
  return rows.filter((row) => memberPanelRowMatchesRoleFilter(row, memberRoleFilter));
}

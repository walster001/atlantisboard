import {
  compareUserRowsByDisplayName,
  memberUserMatchesQuery,
  type MemberUserRow,
} from '../../hooks/members/memberDirectoryUtils.js';

export type WorkspaceRoleKey = string;

export type UserRow = MemberUserRow;

export interface WorkspaceMemberRow {
  readonly user: UserRow;
  readonly roleKey: WorkspaceRoleKey;
}

export type WorkspaceMemberPanelRow =
  | { readonly kind: 'owner'; readonly user: UserRow }
  | { readonly kind: 'member'; readonly member: WorkspaceMemberRow };

export function workspaceMemberPanelRowKey(row: WorkspaceMemberPanelRow): string {
  return row.kind === 'owner' ? `owner:${row.user._id}` : row.member.user._id;
}

export function memberMatchesQuery(member: WorkspaceMemberRow, query: string): boolean {
  return memberUserMatchesQuery(member.user, query);
}

export function canAddUserById(
  existing: readonly WorkspaceMemberRow[],
  ownerId: string | undefined,
  userId: string,
): boolean {
  if (ownerId !== undefined && ownerId === userId) return false;
  return !existing.some((m) => m.user._id === userId);
}

export function workspacePayloadToMemberState(workspace: unknown): {
  owner: UserRow | null;
  members: WorkspaceMemberRow[];
  ownerIdStr: string | undefined;
} {
  const w = workspace as {
    ownerId?: string | UserRow;
    members?: Array<{ userId: string | UserRow; roleKey: WorkspaceRoleKey }>;
  };
  const ownerRaw = w.ownerId;
  const ownerRow: UserRow | null =
    typeof ownerRaw === 'string'
      ? { _id: ownerRaw, displayName: '', email: '' }
      : ownerRaw !== undefined
        ? ownerRaw
        : null;
  const ownerIdStr = ownerRow?._id;
  const byMemberId = new Map<string, WorkspaceMemberRow>();
  for (const m of w.members ?? []) {
    const user: UserRow =
      typeof m.userId === 'string' ? { _id: m.userId, displayName: '', email: '' } : m.userId;
    if (ownerIdStr !== undefined && user._id === ownerIdStr) {
      continue;
    }
    byMemberId.set(user._id, { user, roleKey: m.roleKey });
  }
  const nextMembers = [...byMemberId.values()].sort((a, b) =>
    compareUserRowsByDisplayName(a.user, b.user),
  );
  return { owner: ownerRow, members: nextMembers, ownerIdStr };
}

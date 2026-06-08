export type AtlantisboardExportUserRoleRef = Readonly<{
  readonly id: string;
  readonly boardRoleKey?: string;
}>;

/** userId → portable role from export `users[]` (see {@link resolveAtlantisboardImportMemberRoleKey}). */
export function buildAtlantisboardUserRoleKeyById(
  users: readonly AtlantisboardExportUserRoleRef[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const user of users) {
    const id = user.id.trim();
    const roleKey = user.boardRoleKey?.trim();
    if (id !== '' && roleKey != null && roleKey !== '') {
      map.set(id, roleKey);
    }
  }
  return map;
}

/**
 * Resolves the board member role for Atlantisboard import.
 *
 * Precedence (canonical — keep in sync with export {@link enrichAtlantisboardExportUsers}):
 * 1. `users[].boardRoleKey` — portable across environments (export enrich copies from members;
 *    prefer on import so the target server does not depend on foreign `board.members[].userId` ids).
 * 2. `board.members[].roleKey` — same-environment round-trip when `users[]` omits `boardRoleKey`.
 * 3. `defaultRoleKey` (default `viewer`).
 */
export function resolveAtlantisboardImportMemberRoleKey(
  sourceUserId: string,
  userRoleKeyById: ReadonlyMap<string, string>,
  memberRoleKey: string | undefined,
  defaultRoleKey = 'viewer',
): string {
  const trimmedId = sourceUserId.trim();
  const fromUser = userRoleKeyById.get(trimmedId);
  if (fromUser != null && fromUser !== '') {
    return fromUser;
  }
  const fromMember = memberRoleKey?.trim();
  if (fromMember != null && fromMember !== '') {
    return fromMember;
  }
  return defaultRoleKey;
}

/** Every distinct role key applied to board members during Atlantisboard import (includes importer admin). */
export function collectAtlantisboardImportMemberRoleKeys(
  data: {
    readonly users: readonly AtlantisboardExportUserRoleRef[];
    readonly board: { readonly members: readonly { readonly userId: string; readonly roleKey: string }[] };
  },
  importerUserId: string,
): readonly string[] {
  const userRoleKeyById = buildAtlantisboardUserRoleKeyById(data.users);
  const keys = new Set<string>(['admin']);
  const importerTrimmed = importerUserId.trim();
  for (const member of data.board.members) {
    if (member.userId.trim() === importerTrimmed) {
      continue;
    }
    keys.add(
      resolveAtlantisboardImportMemberRoleKey(member.userId, userRoleKeyById, member.roleKey),
    );
  }
  return [...keys];
}

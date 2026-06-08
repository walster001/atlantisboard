export interface AtlantisboardExportUserSummary {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
}

export interface AtlantisboardExportUserEntry {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly boardRoleKey?: string;
}

/**
 * Adds `boardRoleKey` on each export user from live board membership.
 * Import prefers `users[].boardRoleKey` over `board.members[].roleKey` for cross-environment portability.
 */
export function enrichAtlantisboardExportUsers(
  users: Iterable<AtlantisboardExportUserSummary>,
  params: {
    readonly ownerId: string;
    readonly members: ReadonlyArray<{ readonly userId: { toString(): string }; readonly roleKey: string }>;
  },
): AtlantisboardExportUserEntry[] {
  const roleByUserId = new Map<string, string>();
  for (const member of params.members) {
    const userId = member.userId.toString();
    const roleKey = member.roleKey.trim();
    if (userId !== '' && roleKey !== '') {
      roleByUserId.set(userId, roleKey);
    }
  }

  const ownerId = params.ownerId.trim();
  return [...users].map((user) => {
    const boardRoleKey =
      roleByUserId.get(user.id) ?? (user.id === ownerId ? 'admin' : undefined);
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      ...(boardRoleKey != null ? { boardRoleKey } : {}),
    };
  });
}

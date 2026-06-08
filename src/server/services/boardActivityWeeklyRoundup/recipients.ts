export interface BoardMemberScope {
  readonly ownerId: { toString(): string };
  readonly members: ReadonlyArray<{ userId: { toString(): string } }>;
}

export function boardMemberUserIdSet(board: BoardMemberScope): ReadonlySet<string> {
  const ids = new Set<string>();
  ids.add(board.ownerId.toString());
  for (const member of board.members) {
    ids.add(member.userId.toString());
  }
  return ids;
}

export function filterRoundupRecipientsToBoardMembers(
  board: BoardMemberScope,
  configuredUserIds: readonly string[],
): string[] {
  const allowed = boardMemberUserIdSet(board);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const userId of configuredUserIds) {
    if (!allowed.has(userId) || seen.has(userId)) {
      continue;
    }
    seen.add(userId);
    result.push(userId);
  }
  return result;
}

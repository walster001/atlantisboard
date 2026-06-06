/**
 * Trello JSON exports rarely include per-board role flags; default collaborators to manager.
 */
export function mapTrelloBoardMemberToBoardRoleKey(
  membership?: Readonly<Record<string, unknown>>,
): 'manager' | 'viewer' {
  const memberType =
    membership != null && typeof membership.memberType === 'string'
      ? membership.memberType.trim().toLowerCase()
      : '';
  if (memberType === 'observer' || memberType === 'guest') {
    return 'viewer';
  }
  return 'manager';
}

/** Member ids referenced on cards for a given Trello board id. */
export function collectTrelloMemberIdsForBoard(
  boardId: string,
  cards: ReadonlyArray<{ readonly idBoard: string; readonly idMembers?: readonly string[] | undefined }>,
): readonly string[] {
  const ids = new Set<string>();
  for (const card of cards) {
    if (card.idBoard !== boardId) {
      continue;
    }
    for (const memberId of card.idMembers ?? []) {
      if (memberId.trim() !== '') {
        ids.add(memberId);
      }
    }
  }
  return [...ids];
}

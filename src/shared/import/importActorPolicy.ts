import type { UnmappedUserPolicy } from './importPreflight.js';

export type ImportActorAccountKind = 'registered' | 'board_placeholder' | 'legacy_placeholder_user';

/** Whether an import actor id may be written to cards, comments, attachments, etc. */
export function importActorIdAllowedForPolicy(
  accountKind: ImportActorAccountKind,
  policy: UnmappedUserPolicy,
): boolean {
  if (accountKind === 'registered') {
    return true;
  }
  return policy === 'create_placeholders';
}

/** Board membership only accepts real registered users — never import placeholders. */
export function importActorIdEligibleAsBoardMember(accountKind: ImportActorAccountKind): boolean {
  return accountKind === 'registered';
}

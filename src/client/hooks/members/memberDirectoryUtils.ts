import axios from 'axios';

export const MEMBER_DIRECTORY_PAGE_LIMIT = 100;

export interface MemberUserRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly profilePicture?: string | undefined;
  readonly importPlaceholder?: boolean | undefined;
  readonly importNotMapped?: boolean | undefined;
  /** Role from import mapping (placeholder directory rows). */
  readonly importRoleKey?: string | undefined;
  /** Role applied when placeholder is claimed; editable before sign-in. */
  readonly importPlaceholderRoleKey?: string | undefined;
}

export function isSearchRequestCancelled(error: unknown): boolean {
  return axios.isCancel(error);
}

export function compareUserRowsByDisplayName(
  a: Pick<MemberUserRow, 'displayName' | 'email'>,
  b: Pick<MemberUserRow, 'displayName' | 'email'>,
): number {
  const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  if (byName !== 0) {
    return byName;
  }
  return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
}

export function sortDirectoryUserRows<T extends MemberUserRow>(users: readonly T[]): T[] {
  return [...users].sort(compareUserRowsByDisplayName);
}

export function normalizeMemberSearchString(value: string): string {
  return value.trim().toLowerCase();
}

export function memberUserMatchesQuery(
  user: Pick<MemberUserRow, 'displayName' | 'email'>,
  query: string,
): boolean {
  const q = normalizeMemberSearchString(query);
  if (q === '') {
    return true;
  }
  return (
    normalizeMemberSearchString(user.displayName).includes(q) ||
    normalizeMemberSearchString(user.email).includes(q)
  );
}

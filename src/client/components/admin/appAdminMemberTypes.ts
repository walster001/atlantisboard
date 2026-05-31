import type { MemberUserRow } from '../../hooks/members/memberDirectoryUtils.js';

export type AppAdminUserRow = MemberUserRow;

export function cannotRemoveOwnBootstrapAccess(
  adminId: string,
  currentUserId: string | undefined,
  bootstrapAppAdminId: string | null,
): boolean {
  if (currentUserId === undefined || bootstrapAppAdminId === null) {
    return false;
  }
  return adminId === currentUserId && adminId === bootstrapAppAdminId;
}

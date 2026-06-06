/** Stored as Activity.type; matches audit logger action strings (e.g. Audit: board.member.remove). */
export const BOARD_MEMBER_AUDIT_ACTIVITY_TYPES = [
  'board.member.add',
  'board.member.remove',
  'board.member.role.update',
] as const;

/** Default expiry for board member audit rows when board setting is unset. */
export const BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS = 30;

export type BoardMemberAuditActivityType = (typeof BOARD_MEMBER_AUDIT_ACTIVITY_TYPES)[number];

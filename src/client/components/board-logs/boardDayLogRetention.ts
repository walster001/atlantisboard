import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardMemberAuditActivities.js';
import { BOARD_CONTENT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardContentActivities.js';

export const BOARD_DAY_LOG_DATE_PAGE_SPAN_NEVER_DAYS = 365;

export const BOARD_DAY_LOG_RETENTION_OPTIONS = [
  { value: 'never', label: 'Never expire' },
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const;

export function boardDayLogRetentionSpanDays(
  retentionValue: string,
  defaultDays: number = BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
): number {
  if (retentionValue === 'never') {
    return BOARD_DAY_LOG_DATE_PAGE_SPAN_NEVER_DAYS;
  }
  const n = parseInt(retentionValue, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultDays;
}

export const MEMBER_AUDIT_DEFAULT_RETENTION_DAYS = BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS;
export const BOARD_ACTIVITY_DEFAULT_RETENTION_DAYS = BOARD_CONTENT_DEFAULT_RETENTION_DAYS;

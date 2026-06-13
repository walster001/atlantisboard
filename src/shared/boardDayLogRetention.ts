import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from './constants/boardMemberAuditActivities.js';

export const BOARD_DAY_LOG_DATE_PAGE_SPAN_NEVER_DAYS = 365;

export const BOARD_DAY_LOG_RETENTION_OPTIONS = [
  { value: 'never', label: 'Never expire' },
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const;

export type BoardDayLogRetentionValue = (typeof BOARD_DAY_LOG_RETENTION_OPTIONS)[number]['value'];

export const BOARD_DAY_LOG_RETENTION_QUERY_VALUES = [
  'never',
  '10',
  '30',
  '90',
  '365',
] as const;

export type BoardDayLogRetentionQueryValue = (typeof BOARD_DAY_LOG_RETENTION_QUERY_VALUES)[number];

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

export function retentionValueFromBoardSetting(
  days: number | null | undefined,
  defaultDays: number = BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
): string {
  if (days === undefined) {
    return String(defaultDays);
  }
  return days === null ? 'never' : String(days);
}

export function buildBoardDayLogRetentionSelectData(
  retentionValue: string,
): ReadonlyArray<{ value: string; label: string }> {
  const preset = new Set<string>(
    BOARD_DAY_LOG_RETENTION_OPTIONS.map((option) => option.value),
  );
  if (retentionValue !== 'never' && !preset.has(retentionValue)) {
    return [
      ...BOARD_DAY_LOG_RETENTION_OPTIONS,
      { value: retentionValue, label: `${retentionValue} days` },
    ];
  }
  return [...BOARD_DAY_LOG_RETENTION_OPTIONS];
}

export function parseRetentionSelectValueToStorageDays(
  value: string,
  defaultDays: number = BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
): number | null {
  if (value === 'never') {
    return null;
  }
  const days = parseInt(value, 10);
  return Number.isFinite(days) && days > 0 ? days : defaultDays;
}

export function retentionLowerBoundDate(
  retentionValue: string,
  defaultDays: number = BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
): Date | undefined {
  if (retentionValue === 'never') {
    return undefined;
  }
  const spanDays = boardDayLogRetentionSpanDays(retentionValue, defaultDays);
  return new Date(Date.now() - spanDays * 24 * 60 * 60 * 1000);
}

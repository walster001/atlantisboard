/** User-facing days filter values for admin reporting activity tabs (`all` = only per-board caps). */
export const ADMIN_REPORTING_DAYS_FILTER_VALUES = ['all', '10', '30', '90', '365'] as const;

export type AdminReportingDaysFilterValue = (typeof ADMIN_REPORTING_DAYS_FILTER_VALUES)[number];

export const ADMIN_REPORTING_DAYS_FILTER_OPTIONS: ReadonlyArray<{
  readonly value: AdminReportingDaysFilterValue;
  readonly label: string;
}> = [
  { value: 'all', label: 'All retained' },
  { value: '10', label: 'Last 10 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 365 days' },
];

export function parseAdminReportingDaysFilter(value: string | undefined): number | undefined {
  if (value == null || value === 'all') {
    return undefined;
  }
  const days = Number.parseInt(value, 10);
  return Number.isFinite(days) && days >= 1 && days <= 3650 ? days : undefined;
}

/**
 * Resolves board-stored retention for caps/cleanup.
 * - `null` → never expire (no board cap / skip scheduled cleanup)
 * - valid number → explicit retention
 * - missing/invalid → platform default
 */
export function resolveStoredBoardRetentionDays(
  raw: unknown,
  defaultDays: number,
): number | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 && raw <= 3650) {
    return Math.floor(raw);
  }
  return defaultDays;
}

/** Strictest (most recent) cutoff from optional user filter and board retention. */
export function computeEffectiveActivityCutoffDate(
  boardRetentionRaw: unknown,
  userFilterDays: number | undefined,
  defaultBoardDays: number,
  nowMs: number = Date.now(),
): Date | undefined {
  const cutoffMs: number[] = [];
  if (userFilterDays != null && userFilterDays >= 1) {
    cutoffMs.push(nowMs - userFilterDays * 86_400_000);
  }
  const boardDays = resolveStoredBoardRetentionDays(boardRetentionRaw, defaultBoardDays);
  if (boardDays != null) {
    cutoffMs.push(nowMs - boardDays * 86_400_000);
  }
  if (cutoffMs.length === 0) {
    return undefined;
  }
  return new Date(Math.max(...cutoffMs));
}

export function clampManualActivityCleanupDays(days: number): number {
  if (!Number.isFinite(days)) {
    return 30;
  }
  return Math.min(3650, Math.max(1, Math.floor(days)));
}

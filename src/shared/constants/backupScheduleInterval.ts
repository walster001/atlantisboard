export type BackupScheduleUnit = 'hours' | 'days' | 'weeks' | 'months';

export interface BackupScheduleUnitOption {
  readonly value: BackupScheduleUnit;
  readonly label: string;
}

export const BACKUP_SCHEDULE_UNIT_OPTIONS: readonly BackupScheduleUnitOption[] = [
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
];

export interface BackupScheduleInterval {
  readonly amount: number;
  readonly unit: BackupScheduleUnit;
}

/** Minimum interval (1 hour). Scheduled backup checker runs about every 30 minutes. */
export const BACKUP_SCHEDULE_MIN_MS = 60 * 60 * 1000;

/** Maximum interval (~10 years), aligned with legacy day cap. */
export const BACKUP_SCHEDULE_MAX_MS = 3650 * 24 * 60 * 60 * 1000;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
/** Calendar-month approximation for backup intervals (30 days). */
const MS_PER_MONTH = 30 * MS_PER_DAY;

export function unitToMilliseconds(amount: number, unit: BackupScheduleUnit): number {
  const normalized = Math.floor(amount);
  if (normalized < 1) {
    return BACKUP_SCHEDULE_MIN_MS;
  }
  switch (unit) {
    case 'hours':
      return normalized * MS_PER_HOUR;
    case 'days':
      return normalized * MS_PER_DAY;
    case 'weeks':
      return normalized * MS_PER_WEEK;
    case 'months':
      return normalized * MS_PER_MONTH;
  }
}

export function clampBackupScheduleIntervalMs(ms: number): number {
  if (!Number.isFinite(ms)) {
    return MS_PER_DAY;
  }
  return Math.min(BACKUP_SCHEDULE_MAX_MS, Math.max(BACKUP_SCHEDULE_MIN_MS, Math.floor(ms)));
}

export function backupScheduleToMs(amount: number, unit: BackupScheduleUnit): number {
  return clampBackupScheduleIntervalMs(unitToMilliseconds(amount, unit));
}

export function formatBackupScheduleLabel(amount: number, unit: BackupScheduleUnit): string {
  const normalized = Math.max(1, Math.floor(amount));
  const label = BACKUP_SCHEDULE_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;
  if (normalized === 1) {
    return unit === 'hours' ? '1 hour' : `1 ${unit.slice(0, -1)}`;
  }
  return `${normalized} ${label}`;
}

export function parseBackupScheduleAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export function isBackupScheduleUnit(value: string): value is BackupScheduleUnit {
  return BACKUP_SCHEDULE_UNIT_OPTIONS.some((option) => option.value === value);
}

/** Prefer the stored amount/unit; fall back to legacy `scheduleFrequencyDays`. */
export function resolveBackupScheduleInterval(settings: {
  readonly scheduleIntervalAmount?: number | undefined;
  readonly scheduleIntervalUnit?: string | undefined;
  readonly scheduleFrequencyDays?: number | undefined;
}): BackupScheduleInterval {
  const amount = settings.scheduleIntervalAmount;
  const unitRaw = settings.scheduleIntervalUnit;
  if (typeof amount === 'number' && Number.isFinite(amount) && typeof unitRaw === 'string' && isBackupScheduleUnit(unitRaw)) {
    return { amount: Math.max(1, Math.floor(amount)), unit: unitRaw };
  }
  const legacyDays = settings.scheduleFrequencyDays;
  if (typeof legacyDays === 'number' && Number.isFinite(legacyDays)) {
    return { amount: Math.min(3650, Math.max(1, Math.floor(legacyDays))), unit: 'days' };
  }
  return { amount: 14, unit: 'days' };
}

export function resolveBackupScheduleIntervalMs(settings: {
  readonly scheduleIntervalAmount?: number | undefined;
  readonly scheduleIntervalUnit?: string | undefined;
  readonly scheduleFrequencyDays?: number | undefined;
}): number | null {
  const interval = resolveBackupScheduleInterval(settings);
  return backupScheduleToMs(interval.amount, interval.unit);
}

export function maxAmountForScheduleUnit(unit: BackupScheduleUnit): number {
  switch (unit) {
    case 'hours':
      return Math.floor(BACKUP_SCHEDULE_MAX_MS / MS_PER_HOUR);
    case 'days':
      return 3650;
    case 'weeks':
      return Math.floor(BACKUP_SCHEDULE_MAX_MS / MS_PER_WEEK);
    case 'months':
      return Math.floor(BACKUP_SCHEDULE_MAX_MS / MS_PER_MONTH);
  }
}

export function clampBackupScheduleAmount(amount: number, unit: BackupScheduleUnit): number {
  const max = maxAmountForScheduleUnit(unit);
  return Math.min(max, Math.max(1, Math.floor(amount)));
}

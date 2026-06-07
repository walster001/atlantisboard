/** Preset backup retention values (days). `0` = never delete old backups. */
export const BACKUP_RETENTION_DAY_PRESETS = [1, 5, 10, 30, 60, 90, 180, 0] as const;

export type BackupRetentionDays = (typeof BACKUP_RETENTION_DAY_PRESETS)[number];

export interface BackupRetentionOption {
  readonly value: string;
  readonly label: string;
}

export const BACKUP_RETENTION_OPTIONS: readonly BackupRetentionOption[] = [
  { value: '1', label: '1 day' },
  { value: '5', label: '5 days' },
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '0', label: 'Never' },
];

const PRESET_SET = new Set<number>(BACKUP_RETENTION_DAY_PRESETS);

export function isBackupRetentionPreset(days: number): days is BackupRetentionDays {
  return PRESET_SET.has(days);
}

/** Maps stored retention to the nearest preset for the dropdown (legacy values e.g. 14 → 10). */
export function normalizeBackupRetentionDays(raw: number): BackupRetentionDays {
  if (!Number.isFinite(raw)) {
    return 30;
  }
  const rounded = Math.floor(raw);
  if (isBackupRetentionPreset(rounded)) {
    return rounded;
  }
  if (rounded <= 0) {
    return 0;
  }
  let best: BackupRetentionDays = 30;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of BACKUP_RETENTION_DAY_PRESETS) {
    if (preset === 0) {
      continue;
    }
    const distance = Math.abs(rounded - preset);
    if (distance < bestDistance) {
      best = preset;
      bestDistance = distance;
    }
  }
  return best;
}

export function formatBackupRetentionLabel(days: BackupRetentionDays): string {
  if (days === 0) {
    return 'Never';
  }
  return days === 1 ? '1 day' : `${days} days`;
}

export function parseBackupRetentionSelectValue(value: string | null): BackupRetentionDays | null {
  if (value == null || value.trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || !isBackupRetentionPreset(parsed)) {
    return null;
  }
  return parsed;
}

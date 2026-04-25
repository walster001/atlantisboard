import { isAbsolute, normalize, resolve } from 'node:path';
import { BACKUP_LOCATION_SETUP_GUIDANCE } from '../../shared/constants/backupLocationEnv.js';

function normalizeLocationPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  if (!isAbsolute(trimmed)) {
    throw new Error('BACKUP_LOCATION must be an absolute local filesystem path');
  }
  return normalize(resolve(trimmed));
}

/**
 * Returns the normalized backup directory from `BACKUP_LOCATION`, or `null` if unset or invalid.
 */
export function getResolvedBackupLocationFromEnv(): string | null {
  const raw = process.env.BACKUP_LOCATION?.trim();
  if (raw == null || raw === '') {
    return null;
  }
  try {
    return normalizeLocationPath(raw);
  } catch {
    return null;
  }
}

/**
 * @throws Error with operator-facing guidance when unset or not a valid absolute path.
 */
export function requireBackupLocationFromEnv(): string {
  const resolved = getResolvedBackupLocationFromEnv();
  if (resolved != null) {
    return resolved;
  }
  throw new Error(BACKUP_LOCATION_SETUP_GUIDANCE);
}

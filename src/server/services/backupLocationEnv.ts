import { access, constants as fsConstants, mkdir, stat } from 'node:fs/promises';
import { isAbsolute, normalize, resolve } from 'node:path';
import { BACKUP_LOCATION_ENV_NAME, BACKUP_LOCATION_SETUP_GUIDANCE, DOCKER_FULLSTACK_BACKUP_LOCATION, isDockerFullstackDeployment } from '../../shared/constants/backupLocationEnv.js';
import type {
  AdminBackupLocationCheckResult,
  AdminBackupLocationStatus,
} from '../../shared/types/adminBackupLocation.js';
import { ValidationError } from '../../shared/errors/domainErrors.js';
import { AdminConfig } from '../models/AdminConfig.js';
import { logger } from '../utils/logger.js';
import { upsertEnvFileVariable } from '../utils/envFileWriter.js';

/** Thrown when BACKUP_LOCATION is missing or not a valid absolute path (operator-safe message). */
export class BackupLocationNotConfiguredError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number = 503) {
    super(BACKUP_LOCATION_SETUP_GUIDANCE);
    this.name = 'BackupLocationNotConfiguredError';
    this.statusCode = statusCode;
    this.code = statusCode === 400 ? 'BACKUP_LOCATION_REQUIRED' : 'BACKUP_LOCATION_NOT_CONFIGURED';
  }
}

export function normalizeBackupLocationPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  if (trimmed === '' || trimmed.includes('\0')) {
    throw new ValidationError('Backup path is required');
  }
  if (!isAbsolute(trimmed)) {
    throw new ValidationError('BACKUP_LOCATION must be an absolute local filesystem path');
  }
  return normalize(resolve(trimmed));
}

async function persistBackupLocationToAdminConfig(normalizedPath: string): Promise<void> {
  const config = await AdminConfig.findOne();
  if (config == null) {
    return;
  }
  if (config.backupSettings == null) {
    config.backupSettings = { retentionDays: 14, scheduleEnabled: false };
  }
  config.backupSettings.location = normalizedPath;
  config.markModified('backupSettings');
  await config.save();
}

/**
 * Loads BACKUP_LOCATION from AdminConfig when the process env is unset (e.g. after container rebuild).
 */
export async function hydrateBackupLocationFromAdminConfig(): Promise<void> {
  if (process.env.BACKUP_LOCATION?.trim()) {
    return;
  }
  const config = await AdminConfig.findOne().select('backupSettings.location').lean();
  const raw = config?.backupSettings?.location;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return;
  }
  try {
    process.env.BACKUP_LOCATION = normalizeBackupLocationPath(raw);
  } catch (error: unknown) {
    logger.warn({ error, raw }, 'Ignoring invalid stored backup location in AdminConfig');
  }
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
    return normalizeBackupLocationPath(raw);
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
  throw new BackupLocationNotConfiguredError(503);
}

async function inspectPathOnDisk(normalizedPath: string): Promise<{
  exists: boolean;
  isDirectory: boolean;
  writable: boolean;
}> {
  try {
    const info = await stat(normalizedPath);
    const isDirectory = info.isDirectory();
    let writable = false;
    if (isDirectory) {
      try {
        await access(normalizedPath, fsConstants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }
    return { exists: true, isDirectory, writable };
  } catch {
    return { exists: false, isDirectory: false, writable: false };
  }
}

export async function checkBackupLocationPath(input: string): Promise<AdminBackupLocationCheckResult> {
  const path = normalizeBackupLocationPath(input);
  const disk = await inspectPathOnDisk(path);
  return {
    path,
    exists: disk.exists,
    isDirectory: disk.isDirectory,
    writable: disk.writable,
  };
}

export function getBackupLocationStatus(): AdminBackupLocationStatus {
  const path = getResolvedBackupLocationFromEnv();
  const dockerFullstack = isDockerFullstackDeployment();
  if (path == null) {
    return {
      configured: false,
      path: null,
      exists: false,
      isDirectory: false,
      writable: false,
      persistedToEnvFile: false,
      dockerFullstack,
      suggestedPath: dockerFullstack ? DOCKER_FULLSTACK_BACKUP_LOCATION : null,
    };
  }
  return {
    configured: true,
    path,
    exists: false,
    isDirectory: false,
    writable: false,
    persistedToEnvFile: false,
    dockerFullstack,
    suggestedPath: dockerFullstack ? DOCKER_FULLSTACK_BACKUP_LOCATION : null,
  };
}

export async function getBackupLocationStatusAsync(): Promise<AdminBackupLocationStatus> {
  const path = getResolvedBackupLocationFromEnv();
  const dockerFullstack = isDockerFullstackDeployment();
  const suggestedPath = dockerFullstack ? DOCKER_FULLSTACK_BACKUP_LOCATION : null;
  if (path == null) {
    return getBackupLocationStatus();
  }
  const disk = await inspectPathOnDisk(path);
  return {
    configured: true,
    path,
    exists: disk.exists,
    isDirectory: disk.isDirectory,
    writable: disk.writable,
    persistedToEnvFile: false,
    dockerFullstack,
    suggestedPath,
  };
}

export async function applyBackupLocation(params: {
  readonly path: string;
  readonly createIfMissing: boolean;
}): Promise<AdminBackupLocationStatus> {
  const normalized = normalizeBackupLocationPath(params.path);
  let disk = await inspectPathOnDisk(normalized);

  if (!disk.exists) {
    if (!params.createIfMissing) {
      throw new ValidationError('Backup path does not exist', {
        path: normalized,
        exists: false,
        code: 'BACKUP_PATH_MISSING',
      });
    }
    await mkdir(normalized, { recursive: true });
    disk = await inspectPathOnDisk(normalized);
  }

  if (!disk.isDirectory) {
    throw new ValidationError('Backup path must be a directory', { path: normalized });
  }
  if (!disk.writable) {
    throw new ValidationError('Backup path is not writable by the application process', {
      path: normalized,
    });
  }

  process.env.BACKUP_LOCATION = normalized;
  const persistedToEnvFile = upsertEnvFileVariable(BACKUP_LOCATION_ENV_NAME, normalized);
  await persistBackupLocationToAdminConfig(normalized);
  const dockerFullstack = isDockerFullstackDeployment();

  return {
    configured: true,
    path: normalized,
    exists: disk.exists,
    isDirectory: disk.isDirectory,
    writable: disk.writable,
    persistedToEnvFile,
    dockerFullstack,
    suggestedPath: dockerFullstack ? DOCKER_FULLSTACK_BACKUP_LOCATION : null,
  };
}

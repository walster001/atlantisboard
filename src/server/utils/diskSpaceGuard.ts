import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { InsufficientStorageError } from '../../shared/errors/domainErrors.js';
import {
  formatDiskReserveMb,
  getDiskReserveBytes,
} from '../../shared/constants/diskReserve.js';
import { logger } from './logger.js';

export function parseRequestContentLengthBytes(
  raw: string | readonly string[] | undefined,
): number | null {
  if (raw === undefined) {
    return null;
  }
  const header = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(header ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Bytes we must be able to write to temp storage (declared body size capped by route max). */
export function resolveUploadBytesBudget(args: {
  readonly declaredContentLength: number | null;
  readonly maxUploadBytes: number;
}): number {
  const { declaredContentLength, maxUploadBytes } = args;
  if (declaredContentLength == null) {
    return maxUploadBytes;
  }
  return Math.min(declaredContentLength, maxUploadBytes);
}

export async function getFilesystemAvailableBytes(targetPath: string): Promise<number> {
  const stats = await statfs(targetPath);
  return stats.bavail * stats.bsize;
}

function formatMb(bytes: number): number {
  return Math.max(1, Math.round(bytes / (1024 * 1024)));
}

/**
 * Filesystem path whose free space protects MongoDB Docker volumes on typical fullstack installs.
 * Override when Mongo data lives on a dedicated mount (must be visible inside the app container).
 */
export function resolveMongoDbDiskCheckPath(): string {
  const explicit = process.env.MONGODB_DISK_CHECK_PATH?.trim();
  if (explicit != null && explicit !== '') {
    return explicit;
  }
  const backupLocation = process.env.BACKUP_LOCATION?.trim();
  if (backupLocation != null && backupLocation.startsWith('/')) {
    return dirname(backupLocation);
  }
  return '/';
}

/**
 * Ensures a path has at least `requiredBytes + diskReserve` free (default {@link getDiskReserveBytes}).
 */
export async function assertDiskReserve(args: {
  readonly path: string;
  readonly requiredBytes?: number;
  readonly reserveBytes?: number;
  readonly context: string;
}): Promise<void> {
  const reserveBytes = args.reserveBytes ?? getDiskReserveBytes();
  const requiredBytes = Math.max(0, args.requiredBytes ?? 0);
  const neededBytes = requiredBytes + reserveBytes;

  let availableBytes: number;
  try {
    availableBytes = await getFilesystemAvailableBytes(args.path);
  } catch (error: unknown) {
    logger.warn(
      {
        error,
        path: args.path,
        context: args.context,
        event: 'disk_reserve.statfs_failed',
      },
      'Could not read filesystem free space; allowing operation',
    );
    return;
  }

  if (availableBytes >= neededBytes) {
    return;
  }

  logger.warn(
    {
      path: args.path,
      context: args.context,
      requiredBytes,
      reserveBytes,
      availableBytes,
      event: 'disk_reserve.denied',
    },
    'Operation rejected: insufficient disk space',
  );

  const reserveMb = formatDiskReserveMb(reserveBytes);
  throw new InsufficientStorageError(
    `Not enough disk space (${args.context}: need ~${formatMb(neededBytes)} MB free including ${reserveMb} MB reserve, ~${formatMb(availableBytes)} MB available)`,
  );
}

/** Guard MongoDB writes when the data volume mount is critically low on free space. */
export async function assertMongoDbDiskReserve(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  await assertDiskReserve({
    path: resolveMongoDbDiskCheckPath(),
    requiredBytes: 0,
    context: 'MongoDB data volume',
  });
}

export async function checkMongoDbDiskReserveAtStartup(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const path = resolveMongoDbDiskCheckPath();
  try {
    await assertMongoDbDiskReserve();
    const availableBytes = await getFilesystemAvailableBytes(path);
    logger.info(
      {
        path,
        availableMb: formatMb(availableBytes),
        reserveMb: formatDiskReserveMb(getDiskReserveBytes()),
        event: 'disk_reserve.mongodb_startup_ok',
      },
      'MongoDB disk reserve check passed at startup',
    );
  } catch (error: unknown) {
    logger.error(
      {
        error,
        path,
        reserveMb: formatDiskReserveMb(getDiskReserveBytes()),
        event: 'disk_reserve.mongodb_startup_low',
      },
      'MongoDB disk reserve check failed at startup — database writes will be rejected until space is freed',
    );
  }
}

/** Upload temp files — same reserve as MongoDB guard. */
export async function assertUploadDiskHeadroom(args: {
  readonly directory: string;
  readonly requiredBytes: number;
}): Promise<void> {
  await assertDiskReserve({
    path: args.directory,
    requiredBytes: args.requiredBytes,
    context: 'upload temp storage',
  });
}

export function resolveUploadTempDirectory(): string {
  return tmpdir();
}

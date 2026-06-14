import { statfs } from 'node:fs/promises';
import { InsufficientStorageError } from '../../shared/errors/domainErrors.js';
import { logger } from './logger.js';

/** Minimum free space kept on the upload volume after accepting a file (default 128 MiB). */
const DEFAULT_UPLOAD_DISK_RESERVE_MB = 128;

export function getUploadDiskReserveBytes(): number {
  const parsed = Number.parseInt(process.env.UPLOAD_DISK_RESERVE_MB ?? '', 10);
  const mb = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_UPLOAD_DISK_RESERVE_MB;
  return mb * 1024 * 1024;
}

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
 * Ensures `directory` has enough free space for an incoming upload plus reserve.
 * Uses `statfs` (non-blocking metadata read) before multer streams to disk.
 */
export async function assertUploadDiskHeadroom(args: {
  readonly directory: string;
  readonly requiredBytes: number;
  readonly reserveBytes?: number;
}): Promise<void> {
  const reserveBytes = args.reserveBytes ?? getUploadDiskReserveBytes();
  const requiredBytes = Math.max(0, args.requiredBytes);
  const neededBytes = requiredBytes + reserveBytes;

  let availableBytes: number;
  try {
    availableBytes = await getFilesystemAvailableBytes(args.directory);
  } catch (error: unknown) {
    logger.warn(
      { error, directory: args.directory, event: 'upload.disk_headroom.statfs_failed' },
      'Could not read filesystem free space before upload; allowing request',
    );
    return;
  }

  if (availableBytes >= neededBytes) {
    return;
  }

  logger.warn(
    {
      directory: args.directory,
      requiredBytes,
      reserveBytes,
      availableBytes,
      event: 'upload.disk_headroom.denied',
    },
    'Upload rejected: insufficient disk space on temp volume',
  );

  throw new InsufficientStorageError(
    `Not enough disk space for this upload (need ~${formatMb(neededBytes)} MB free on server temp storage, ~${formatMb(availableBytes)} MB available)`,
  );
}

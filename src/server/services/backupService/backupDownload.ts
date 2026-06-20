import { access, constants as fsConstants } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { isScheduledBackupFolderId } from '../../../shared/utils/backupFolderNaming.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../shared/errors/domainErrors.js';
import { requireBackupLocationFromEnv } from '../backupLocationEnv.js';
import { listBackupsCatalog } from './backupCatalog.js';

export function assertBackupFileUnderLocation(filePath: string, location: string): void {
  const resolvedFile = resolve(filePath);
  const resolvedLocation = resolve(location);
  const prefix = resolvedLocation.endsWith(sep) ? resolvedLocation : `${resolvedLocation}${sep}`;
  if (resolvedFile !== resolvedLocation && !resolvedFile.startsWith(prefix)) {
    throw new ForbiddenError('Backup file path is outside the configured backup location');
  }
}

export async function resolveBackupDownloadTarget(
  folderId: string,
): Promise<{ filePath: string; fileName: string; sizeBytes: number }> {
  if (isScheduledBackupFolderId(folderId)) {
    throw new BadRequestError('Scheduled backup definitions cannot be downloaded');
  }
  const location = requireBackupLocationFromEnv();
  const entries = await listBackupsCatalog();
  const entry = entries.find((item) => item.folderId === folderId);
  if (entry == null) {
    throw new NotFoundError('Backup not found');
  }
  if (entry.status !== 'completed') {
    throw new BadRequestError('Backup is not available for download');
  }
  if (entry.entryKind === 'schedule') {
    throw new BadRequestError('Scheduled backup definitions cannot be downloaded');
  }
  const filePath = entry.filePath.trim();
  if (filePath === '') {
    throw new NotFoundError('Backup archive path is missing');
  }

  const resolvedFile = resolve(filePath);
  assertBackupFileUnderLocation(resolvedFile, location);

  try {
    await access(resolvedFile, fsConstants.R_OK);
  } catch {
    throw new NotFoundError('Backup archive file not found on disk');
  }

  return {
    filePath: resolvedFile,
    fileName: basename(resolvedFile),
    sizeBytes: entry.sizeBytes,
  };
}

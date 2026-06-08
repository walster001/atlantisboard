import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { getBackupImportMaxBytes } from '../../constants/uploads.js';
import { BackupJob } from '../../models/BackupJob.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { scanUploadForMalware } from '../../utils/uploadMalwareScan.js';
import { ValidationError } from '../../../shared/errors/domainErrors.js';
import { requireBackupLocationFromEnv } from '../backupLocationEnv.js';
import { buildBackupFilePath, listBackupsCatalog } from './backupCatalog.js';
import {
  isAllowedBackupZipFileName,
  isAllowedBackupZipMimeType,
  validateBackupZipArchive,
} from './backupImportValidation.js';
import { newBackupFolderId, normalizeFilename, normalizeLocationPath } from './backupShared.js';

export interface ImportBackupArchiveParams {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly tempFilePath: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly filenameOverride?: string | undefined;
}

export interface ImportBackupArchiveResult {
  readonly folderId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly jobId: string;
  readonly backupSource: 'imported';
}

export async function importBackupArchive(
  params: ImportBackupArchiveParams,
): Promise<ImportBackupArchiveResult> {
  const maxBytes = getBackupImportMaxBytes();
  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0) {
    throw new ValidationError('Uploaded file is empty');
  }
  if (params.sizeBytes > maxBytes) {
    throw new ValidationError(
      `Backup file exceeds maximum import size of ${Math.round(maxBytes / (1024 * 1024))} MB`,
    );
  }

  const displayName =
    params.filenameOverride != null && params.filenameOverride.trim() !== ''
      ? params.filenameOverride.trim()
      : params.originalFileName;
  if (!isAllowedBackupZipFileName(displayName)) {
    throw new ValidationError('Only .zip backup archives are allowed');
  }
  if (!isAllowedBackupZipMimeType(params.mimeType)) {
    throw new ValidationError('Only ZIP backup archives are allowed');
  }

  await validateBackupZipArchive(params.tempFilePath);

  await scanUploadForMalware(
    { kind: 'disk', path: params.tempFilePath },
    displayName,
    'application/zip',
  );

  const location = requireBackupLocationFromEnv();
  const normalizedLocation = normalizeLocationPath(location);
  const filename = normalizeFilename(displayName);
  const existingFolderIds = new Set((await listBackupsCatalog()).map((entry) => entry.folderId));
  const folderId = newBackupFolderId(existingFolderIds);
  const filePath = buildBackupFilePath(normalizedLocation, folderId, filename);

  await mkdir(dirname(filePath), { recursive: true });
  await copyFile(params.tempFilePath, filePath);
  const storedStat = await stat(filePath);

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const doc = await BackupJob.create({
    userId: new mongoose.Types.ObjectId(params.userId),
    jobKind: 'backup',
    backupSource: 'imported',
    status: 'completed',
    progress: 100,
    totalItems: 1,
    processedItems: 1,
    currentPhase: 'imported',
    filename,
    location: normalizedLocation,
    result: {
      folderId,
      filePath,
      sizeBytes: storedStat.size,
      prunedCount: 0,
    },
    completedAt: new Date(),
    expiresAt,
  });

  logAuditEvent({
    userId: params.userId,
    action: 'admin_backup_imported',
    resourceType: 'backup',
    resourceId: folderId,
    ipAddress: params.ipAddress,
    metadata: { filePath, sizeBytes: storedStat.size, backupSource: 'imported' },
    timestamp: new Date(),
  });

  return {
    folderId,
    filePath,
    sizeBytes: storedStat.size,
    jobId: doc._id.toString(),
    backupSource: 'imported',
  };
}

export async function cleanupImportedBackupTempFile(tempFilePath: string | undefined): Promise<void> {
  if (tempFilePath == null || tempFilePath.trim() === '') {
    return;
  }
  await rm(tempFilePath, { force: true });
}

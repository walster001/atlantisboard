import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { finished, pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import { MINIO_BUCKET_BACKUPS, MINIO_BUCKET_NAMES } from '../../../shared/constants/minioBuckets.js';
import { getAdminConfig } from '../adminService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';
import {
  BACKUP_FORMAT,
  BACKUP_PHASE_TOTAL,
  newBackupFolderId,
  normalizeFilename,
  normalizeLocationPath,
  progressRange,
  throwIfCancelled,
  type BackupProgressReporter,
} from './backupShared.js';
import { buildBackupFilePath, listBackupsCatalog, pruneOldBackups } from './backupCatalog.js';
import { dumpMongoCollectionsToBsonDir } from './mongoArchive.js';
import {
  type MinioArchiveMethod,
  collectMinioObjectMetadataByBucket,
  mirrorMinioBucketsToWorkdir,
  mirrorMinioBucketsToWorkdirWithSdk,
} from './minioIo.js';

async function resolveBackupStagingRoot(location: string): Promise<string> {
  const normalized = normalizeLocationPath(location);
  const stagingRoot = join(normalized, '.staging');
  try {
    await mkdir(stagingRoot, { recursive: true });
    await access(stagingRoot, fsConstants.W_OK);
    return stagingRoot;
  } catch (error) {
    logger.warn(
      { error, location: normalized },
      'Backup staging under BACKUP_LOCATION unavailable; falling back to /tmp',
    );
    return tmpdir();
  }
}

async function copyFileWithProgress(params: {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly signal: AbortSignal;
  readonly onProgress?: (copiedBytes: number, totalBytes: number) => Promise<void> | void;
}): Promise<void> {
  const { sourcePath, destinationPath, signal, onProgress } = params;
  const st = await stat(sourcePath);
  const totalBytes = Math.max(0, st.size);
  let copiedBytes = 0;
  const readStream = createReadStream(sourcePath);
  const writeStream = createWriteStream(destinationPath);
  signal.addEventListener('abort', () => {
    readStream.destroy(new Error('BACKUP_CANCELLED'));
    writeStream.destroy(new Error('BACKUP_CANCELLED'));
  });
  if (onProgress != null) {
    await onProgress(copiedBytes, totalBytes);
  }
  readStream.on('data', (chunk: Buffer) => {
    copiedBytes += chunk.length;
    if (onProgress != null) {
      void onProgress(copiedBytes, totalBytes);
    }
  });
  await pipeline(readStream, writeStream);
}

/**
 * Runs the full backup on the server with progress callbacks (used by {@link startBackupJob}).
 */
export async function executeFullBackupWithProgressImpl(params: {
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
  readonly location: string;
  readonly signal: AbortSignal;
  readonly onProgress: BackupProgressReporter;
}): Promise<{ folderId: string; filePath: string; sizeBytes: number; prunedCount: number }> {
  const { onProgress: reporter } = params;
  const stagingRoot = await resolveBackupStagingRoot(params.location);
  const mongoDir = await mkdtemp(join(stagingRoot, 'atlboard-mongo-'));
  const minioMirrorDir = await mkdtemp(join(stagingRoot, 'atlboard-minio-mirror-'));
  const zipPath = join(stagingRoot, `atlboard-backup-${Date.now()}.zip`);
  let minioArchiveMethod: MinioArchiveMethod = 'mc-mirror-v1';
  try {
    throwIfCancelled(params.signal);
    await reporter.report('minio_export', 6, 0, BACKUP_PHASE_TOTAL);
    try {
      await mirrorMinioBucketsToWorkdir({
        minioRoot: minioMirrorDir,
        signal: params.signal,
        throwIfCancelled,
        onBucketMirrored: async (completed, total) => {
          await reporter.report(
            'minio_export',
            progressRange(6, 42, completed, total),
            1,
            BACKUP_PHASE_TOTAL,
          );
        },
      });
      minioArchiveMethod = 'mc-mirror-v1';
    } catch (error) {
      logger.warn({ error }, 'mc mirror failed; falling back to MinIO SDK mirror');
      await mirrorMinioBucketsToWorkdirWithSdk({
        minioRoot: minioMirrorDir,
        signal: params.signal,
        throwIfCancelled,
        onBucketMirrored: async (completed, total) => {
          await reporter.report(
            'minio_export',
            progressRange(6, 42, completed, total),
            1,
            BACKUP_PHASE_TOTAL,
          );
        },
      });
      minioArchiveMethod = 'sdk-stream-v1';
    }
    throwIfCancelled(params.signal);
    await reporter.report('minio_export', 42, 1, BACKUP_PHASE_TOTAL);

    await reporter.report('mongo_export', 43, 1, BACKUP_PHASE_TOTAL);
    const collectionNames = await dumpMongoCollectionsToBsonDir({
      mongoDir,
      onCollectionDumped: async (completed, total) => {
        await reporter.report(
          'mongo_export',
          progressRange(43, 78, completed, total),
          2,
          BACKUP_PHASE_TOTAL,
        );
      },
    });
    throwIfCancelled(params.signal);
    await reporter.report('mongo_export', 78, 2, BACKUP_PHASE_TOTAL);

    const manifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      mongoExportFormat: 'bson-v1',
      minioArchiveMethod,
      mongoCollections: collectionNames,
      minioBuckets: MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS),
      minioMetadataFile: 'minio-metadata.json',
    };
    const minioObjectMetadata = await collectMinioObjectMetadataByBucket(
      MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS),
    );

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err: Error) => {
      output.destroy(err);
    });
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify(minioObjectMetadata, null, 2), { name: 'minio-metadata.json' });
    archive.directory(mongoDir, 'mongo');
    archive.directory(minioMirrorDir, 'minio');

    await reporter.report('zip_finalize', 79, 2, BACKUP_PHASE_TOTAL);
    await archive.finalize();
    await finished(output);
    throwIfCancelled(params.signal);
    await reporter.report('zip_finalize', 88, 3, BACKUP_PHASE_TOTAL);

    const st = await stat(zipPath);
    const existingFolderIds = new Set((await listBackupsCatalog()).map((entry) => entry.folderId));
    const folderId = newBackupFolderId(existingFolderIds);
    const filename = normalizeFilename(params.filename);
    const location = normalizeLocationPath(params.location);
    const filePath = buildBackupFilePath(location, folderId, filename);
    await mkdir(dirname(filePath), { recursive: true });
    await reporter.report('upload', 89, 3, BACKUP_PHASE_TOTAL);
    await copyFileWithProgress({
      sourcePath: zipPath,
      destinationPath: filePath,
      signal: params.signal,
      onProgress: async (copiedBytes, totalBytes) => {
        const p = progressRange(89, 96, copiedBytes, Math.max(1, totalBytes));
        await reporter.report('upload', p, 4, BACKUP_PHASE_TOTAL);
      },
    });
    throwIfCancelled(params.signal);
    await reporter.report('upload', 96, 4, BACKUP_PHASE_TOTAL);

    const cfg = await getAdminConfig();
    const retention = cfg.backupSettings?.retentionDays ?? 14;
    await reporter.report('retention', 97, 4, BACKUP_PHASE_TOTAL);
    const prunedCount = await pruneOldBackups(retention);
    await reporter.report('done', 100, 5, BACKUP_PHASE_TOTAL);

    logAuditEvent({
      userId: params.adminUserId,
      action: 'admin_backup_created',
      resourceType: 'backup',
      resourceId: folderId,
      ipAddress: params.ipAddress,
      metadata: { filePath, sizeBytes: st.size, prunedCount },
      timestamp: new Date(),
    });

    return { folderId, filePath, sizeBytes: st.size, prunedCount };
  } finally {
    await rm(mongoDir, { recursive: true, force: true });
    await rm(minioMirrorDir, { recursive: true, force: true });
    await rm(zipPath, { force: true });
  }
}

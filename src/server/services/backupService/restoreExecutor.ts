import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import { MINIO_BUCKET_NAMES } from '../../../shared/constants/minioBuckets.js';
import { getMinIOClient } from '../../config/minio.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';
import { BackupJob } from '../../models/BackupJob.js';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_V1,
  RESTORE_PHASE_TOTAL,
  progressRange,
  throwIfCancelled,
  type BackupProgressReporter,
  type ParsedBackupManifest,
} from './backupShared.js';
import { type MinioObjectMetadataMap, buildPutObjectMetadata, restoreMinioBucketsWithMcMirror } from './minioIo.js';
import { restoreMongoFromDir } from './mongoArchive.js';
import { getMinioObjectTransferConcurrency } from './runtime.js';
import { runWithConcurrency } from '../../../shared/utils/runWithConcurrency.js';
import {
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domainErrors.js';

async function readManifest(extractRoot: string): Promise<ParsedBackupManifest> {
  const raw = await readFile(join(extractRoot, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    format?: string;
    mongoCollections?: string[];
    mongoExportFormat?: string;
    minioArchiveMethod?: string;
    minioMetadataFile?: string;
  };
  if (parsed.format !== BACKUP_FORMAT && parsed.format !== BACKUP_FORMAT_V1) {
    throw new Error(`Unsupported backup format: ${String(parsed.format)}`);
  }
  if (!Array.isArray(parsed.mongoCollections)) {
    throw new ValidationError('Invalid manifest: mongoCollections');
  }
  const fmt = parsed.format === BACKUP_FORMAT_V1 ? BACKUP_FORMAT_V1 : BACKUP_FORMAT;
  const minioArchiveMethod =
    fmt === BACKUP_FORMAT_V1
      ? 'sdk-stream-v1'
      : parsed.minioArchiveMethod === 'mc-mirror-v1'
        ? 'mc-mirror-v1'
        : 'mc-mirror-v1';
  return {
    format: fmt,
    mongoCollections: parsed.mongoCollections,
    minioArchiveMethod,
    ...(typeof parsed.minioMetadataFile === 'string' && parsed.minioMetadataFile.trim() !== ''
      ? { minioMetadataFile: parsed.minioMetadataFile.trim() }
      : {}),
  };
}

async function readMinioObjectMetadataMap(
  extractRoot: string,
  manifest: ParsedBackupManifest,
): Promise<MinioObjectMetadataMap> {
  const fileName = manifest.minioMetadataFile ?? 'minio-metadata.json';
  const filePath = join(extractRoot, fileName);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    const out: MinioObjectMetadataMap = {};
    for (const [bucket, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val == null || typeof val !== 'object') {
        continue;
      }
      const objMetaByKey: Record<string, Record<string, string>> = {};
      for (const [key, md] of Object.entries(val as Record<string, unknown>)) {
        if (md == null || typeof md !== 'object') {
          continue;
        }
        const mdOut: Record<string, string> = {};
        for (const [mk, mv] of Object.entries(md as Record<string, unknown>)) {
          if (typeof mv === 'string') {
            mdOut[mk] = mv;
          }
        }
        if (Object.keys(mdOut).length > 0) {
          objMetaByKey[key] = mdOut;
        }
      }
      if (Object.keys(objMetaByKey).length > 0) {
        out[bucket] = objMetaByKey;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function walkRelativeFiles(dir: string, baseRel: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    const rel = baseRel === '' ? ent.name : `${baseRel}/${ent.name}`;
    if (ent.isDirectory()) {
      out.push(...(await walkRelativeFiles(p, rel)));
    } else if (ent.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function restoreMinioFromDir(
  extractRoot: string,
  manifest: ParsedBackupManifest,
  signal: AbortSignal,
  minioObjectMetadata: MinioObjectMetadataMap,
  onObjectRestored?: (completed: number, total: number) => Promise<void> | void,
): Promise<void> {
  const root = join(extractRoot, 'minio');
  const hasMetadataMap = Object.keys(minioObjectMetadata).length > 0;
  if (manifest.minioArchiveMethod === 'mc-mirror-v1' && !hasMetadataMap) {
    try {
      const ac = new AbortController();
      await restoreMinioBucketsWithMcMirror(root, ac.signal);
      return;
    } catch (error) {
      const isMcUnavailable =
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT';
      if (!isMcUnavailable) {
        throw error;
      }
      logger.warn({ error }, 'mc binary unavailable during restore; falling back to MinIO SDK put');
      // Continue to SDK restore path below.
    }
  }
  const client = getMinIOClient();
  const rels = await walkRelativeFiles(root, '');
  const allowed = new Set<string>([...MINIO_BUCKET_NAMES]);
  const objects = rels
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((norm) => {
      const slash = norm.indexOf('/');
      if (slash < 1) {
        return false;
      }
      const bucket = norm.slice(0, slash);
      return allowed.has(bucket);
    });
  const totalObjects = objects.length;
  let restoredObjects = 0;
  const objectConcurrency = getMinioObjectTransferConcurrency();
  await runWithConcurrency(objects, objectConcurrency, async (norm) => {
    throwIfCancelled(signal);
    const slash = norm.indexOf('/');
    const bucket = norm.slice(0, slash);
    const objectKey = norm.slice(slash + 1);
    const filePath = join(root, norm);
    const putMetadata = buildPutObjectMetadata(minioObjectMetadata[bucket]?.[objectKey]);
    await client.fPutObject(bucket, objectKey, filePath, putMetadata);
    restoredObjects += 1;
    if (onObjectRestored != null) {
      await onObjectRestored(restoredObjects, totalObjects);
    }
  });
}

export async function restoreFullBackupImpl(params: {
  readonly folderId: string;
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly signal?: AbortSignal;
  readonly onProgress?: BackupProgressReporter;
}): Promise<void> {
  const doc = await BackupJob.findOne({ 'result.folderId': params.folderId }).sort({ completedAt: -1 }).lean();
  if (!doc?.result?.filePath) {
    throw new NotFoundError('Backup archive not found');
  }
  const filePath = doc.result.filePath;
  const zipPath = join(tmpdir(), `restore-${Date.now()}.zip`);
  const extractDir = await mkdtemp(join(tmpdir(), 'atlboard-restore-'));
  try {
    const signal = params.signal ?? new AbortController().signal;
    await params.onProgress?.report('restore_extract', 2, 0, RESTORE_PHASE_TOTAL);
    await copyFile(filePath, zipPath);
    throwIfCancelled(signal);
    await params.onProgress?.report('restore_extract', 18, 1, RESTORE_PHASE_TOTAL);
    await pipeline(createReadStream(zipPath), unzipper.Extract({ path: extractDir }));
    throwIfCancelled(signal);
    await params.onProgress?.report('restore_extract', 24, 1, RESTORE_PHASE_TOTAL);
    const manifest = await readManifest(extractDir);
    const minioObjectMetadata = await readMinioObjectMetadataMap(extractDir, manifest);
    await params.onProgress?.report('restore_mongo', 25, 1, RESTORE_PHASE_TOTAL);
    await restoreMongoFromDir(extractDir, manifest, async (completed, total) => {
      await params.onProgress?.report(
        'restore_mongo',
        progressRange(25, 68, completed, Math.max(1, total)),
        2,
        RESTORE_PHASE_TOTAL,
      );
    });
    throwIfCancelled(signal);
    await params.onProgress?.report('restore_mongo', 68, 2, RESTORE_PHASE_TOTAL);
    await params.onProgress?.report('restore_minio', 69, 2, RESTORE_PHASE_TOTAL);
    await restoreMinioFromDir(extractDir, manifest, signal, minioObjectMetadata, async (completed, total) => {
      await params.onProgress?.report(
        'restore_minio',
        progressRange(69, 96, completed, Math.max(1, total)),
        3,
        RESTORE_PHASE_TOTAL,
      );
    });
    await params.onProgress?.report('restore_minio', 96, 3, RESTORE_PHASE_TOTAL);
    await params.onProgress?.report('restore_done', 100, RESTORE_PHASE_TOTAL, RESTORE_PHASE_TOTAL);
    logAuditEvent({
      userId: params.adminUserId,
      action: 'admin_backup_restored',
      resourceType: 'backup',
      resourceId: params.folderId,
      ipAddress: params.ipAddress,
      timestamp: new Date(),
    });
  } finally {
    await rm(zipPath, { force: true });
    await rm(extractDir, { recursive: true, force: true });
  }
}

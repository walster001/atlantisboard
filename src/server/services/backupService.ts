import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { cpus, tmpdir } from 'node:os';
import { finished, pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import { BSON, EJSON } from 'bson';
import type { Document } from 'mongodb';
import mongoose from 'mongoose';
import unzipper from 'unzipper';
import { MINIO_BUCKET_BACKUPS, MINIO_BUCKET_NAMES } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient } from '../config/minio.js';
import { getAdminConfig } from './adminService.js';
import { requireBackupLocationFromEnv, getResolvedBackupLocationFromEnv } from './backupLocationEnv.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { BackupJob } from '../models/BackupJob.js';

/** Current archive manifest format (BSON mongo + mc mirror/sdk minio). */
const BACKUP_FORMAT = 'atlboard-backup-v2' as const;
const BACKUP_FORMAT_V1 = 'atlboard-backup-v1' as const;
type MinioArchiveMethod = 'sdk-stream-v1' | 'mc-mirror-v1';
type MinioObjectMetadataMap = Record<string, Record<string, Record<string, string>>>;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

function getMongoExportConcurrency(): number {
  const cpuCount = Math.max(1, cpus().length);
  const fallback = Math.min(4, cpuCount);
  return Math.max(1, Math.min(16, parsePositiveIntEnv('BACKUP_MONGO_EXPORT_CONCURRENCY', fallback)));
}

function getMongoCursorBatchSize(): number {
  return Math.max(200, Math.min(10_000, parsePositiveIntEnv('BACKUP_MONGO_CURSOR_BATCH_SIZE', 1000)));
}

function getMongoInsertBatchSize(): number {
  return Math.max(200, Math.min(10_000, parsePositiveIntEnv('BACKUP_MONGO_INSERT_BATCH_SIZE', 1200)));
}

function getMinioBucketMirrorConcurrency(): number {
  return Math.max(1, Math.min(8, parsePositiveIntEnv('BACKUP_MINIO_BUCKET_CONCURRENCY', 2)));
}

function getMinioObjectTransferConcurrency(): number {
  return Math.max(1, Math.min(32, parsePositiveIntEnv('BACKUP_MINIO_OBJECT_CONCURRENCY', 8)));
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const width = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index]!, index);
      }
    }),
  );
}

/**
 * MinIO mirror via MinIO Client (`mc mirror`). Set `BACKUP_MC_MIRROR_ALIAS` to an `mc` alias
 * that points at this deployment (e.g. `mc alias set local http://localhost:9000 …`).
 * `BACKUP_MC_PATH` defaults to `mc` on PATH.
 */
function getMcMirrorConfig(): { readonly mcPath: string; readonly mirrorAlias: string } {
  const mcPath = (process.env.BACKUP_MC_PATH ?? 'mc').trim() || 'mc';
  const mirrorAlias = (process.env.BACKUP_MC_MIRROR_ALIAS ?? process.env.MINIO_MC_ALIAS ?? 'local').trim() || 'local';
  return { mcPath, mirrorAlias };
}

function runMcCommand(
  mcPath: string,
  args: readonly string[],
  options: { readonly signal: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(mcPath, [...args], {
      stdio: 'inherit',
      shell: false,
      signal: options.signal,
    });
    child.on('error', reject);
    child.on('close', (code, killSignal) => {
      if (killSignal != null) {
        reject(new Error(`mc exited after signal ${killSignal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`\`${mcPath} ${args.join(' ')}\` exited with code ${String(code)}`));
    });
  });
}

async function mirrorMinioBucketsToWorkdir(params: {
  readonly minioRoot: string;
  readonly signal: AbortSignal;
  readonly onBucketMirrored?: (completed: number, total: number, bucket: string) => Promise<void> | void;
}): Promise<void> {
  const { minioRoot, signal, onBucketMirrored } = params;
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const buckets = MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS);
  if (buckets.length === 0) {
    return;
  }
  const doneRef = { value: 0 };
  const width = getMinioBucketMirrorConcurrency();
  await runWithConcurrency(buckets, width, async (bucket) => {
    throwIfCancelled(signal);
    const dest = join(minioRoot, bucket);
    await mkdir(dest, { recursive: true });
    const src = `${mirrorAlias}/${bucket}`;
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', src, dest], { signal });
    doneRef.value += 1;
    logger.info({ bucket, index: doneRef.value, total: buckets.length }, 'mc mirror bucket complete');
    if (onBucketMirrored != null) {
      await onBucketMirrored(doneRef.value, buckets.length, bucket);
    }
  });
}

async function listBucketObjectKeys(bucket: string): Promise<string[]> {
  const client = getMinIOClient();
  const stream = client.listObjectsV2(bucket, '', true);
  return await new Promise<string[]>((resolve, reject) => {
    const keys: string[] = [];
    stream.on('data', (obj: { name?: string }) => {
      if (typeof obj.name === 'string' && obj.name.trim() !== '') {
        keys.push(obj.name);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(keys));
  });
}

function normalizeMinioStatMetadata(meta: Record<string, string> | undefined): Record<string, string> {
  if (meta == null) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v !== 'string') {
      continue;
    }
    const key = k.trim().toLowerCase();
    if (
      key === 'content-type' ||
      key === 'cache-control' ||
      key.startsWith('x-amz-meta-')
    ) {
      out[key] = v;
    }
  }
  return out;
}

async function collectMinioObjectMetadataByBucket(
  buckets: readonly string[],
): Promise<MinioObjectMetadataMap> {
  const client = getMinIOClient();
  const out: MinioObjectMetadataMap = {};
  for (const bucket of buckets) {
    const keys = await listBucketObjectKeys(bucket);
    const bucketMeta: Record<string, Record<string, string>> = {};
    const width = getMinioObjectTransferConcurrency();
    await runWithConcurrency(keys, width, async (key) => {
      try {
        const st = await client.statObject(bucket, key);
        const normalized = normalizeMinioStatMetadata(st.metaData as Record<string, string> | undefined);
        if (Object.keys(normalized).length > 0) {
          bucketMeta[key] = normalized;
        }
      } catch (error) {
        logger.warn({ error, bucket, key }, 'Failed to read MinIO object metadata during backup');
      }
    });
    if (Object.keys(bucketMeta).length > 0) {
      out[bucket] = bucketMeta;
    }
  }
  return out;
}

function buildPutObjectMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (metadata == null) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const key = k.toLowerCase();
    if (key === 'content-type') {
      out['Content-Type'] = v;
    } else if (key === 'cache-control') {
      out['Cache-Control'] = v;
    } else if (key.startsWith('x-amz-meta-')) {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function mirrorMinioBucketsToWorkdirWithSdk(params: {
  readonly minioRoot: string;
  readonly signal: AbortSignal;
  readonly onBucketMirrored?: (completed: number, total: number, bucket: string) => Promise<void> | void;
}): Promise<void> {
  const { minioRoot, signal, onBucketMirrored } = params;
  const client = getMinIOClient();
  const buckets = MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS);
  if (buckets.length === 0) {
    return;
  }
  let completedBuckets = 0;
  for (const bucket of buckets) {
    throwIfCancelled(signal);
    const bucketDir = join(minioRoot, bucket);
    await mkdir(bucketDir, { recursive: true });
    const keys = await listBucketObjectKeys(bucket);
    const objectConcurrency = getMinioObjectTransferConcurrency();
    await runWithConcurrency(keys, objectConcurrency, async (key) => {
      throwIfCancelled(signal);
      const outPath = join(bucketDir, key);
      await mkdir(dirname(outPath), { recursive: true });
      await client.fGetObject(bucket, key, outPath);
    });
    completedBuckets += 1;
    logger.info({ bucket, index: completedBuckets, total: buckets.length }, 'sdk mirror bucket complete');
    if (onBucketMirrored != null) {
      await onBucketMirrored(completedBuckets, buckets.length, bucket);
    }
  }
}

async function restoreMinioBucketsWithMcMirror(minioRoot: string, signal: AbortSignal): Promise<void> {
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const allowed = new Set<string>([...MINIO_BUCKET_NAMES]);
  let entries: string[];
  try {
    entries = await readdir(minioRoot);
  } catch {
    return;
  }
  for (const bucket of entries) {
    if (!allowed.has(bucket) || bucket === MINIO_BUCKET_BACKUPS) {
      continue;
    }
    const localBucketPath = join(minioRoot, bucket);
    let st;
    try {
      st = await stat(localBucketPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      continue;
    }
    throwIfCancelled(signal);
    const dest = `${mirrorAlias}/${bucket}`;
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', `${localBucketPath}/`, dest], {
      signal,
    });
  }
}

const MONGO_RESTORE_ORDER: readonly string[] = [
  'roledefinitions',
  'permissionsets',
  'users',
  'adminconfigs',
  'backupjobs',
  'workspaces',
  'boards',
  'boardlabels',
  'lists',
  'cards',
  'activities',
  'sessions',
  'invitelinks',
  'importjobs',
  'notifications',
];

export interface BackupListEntry {
  readonly folderId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
  readonly status: 'completed' | 'processing' | 'pending' | 'failed' | 'cancelled';
  readonly progress?: number;
  readonly jobId?: string;
}

function sortCollectionsForRestore(names: readonly string[]): string[] {
  const set = new Set(names);
  const ordered: string[] = [];
  for (const n of MONGO_RESTORE_ORDER) {
    if (set.has(n)) {
      ordered.push(n);
    }
  }
  const rest = [...set].filter((n) => !ordered.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}

function newBackupFolderId(): string {
  const iso = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  return `${Date.now()}_${iso}`;
}

function backupFolderMillis(folderId: string): number | null {
  const i = folderId.indexOf('_');
  if (i <= 0) {
    return null;
  }
  const ms = Number(folderId.slice(0, i));
  return Number.isFinite(ms) ? ms : null;
}

function normalizeFilename(input: string): string {
  const trimmed = input.trim();
  const base = basename(trimmed);
  const safe = base.replace(/[^0-9A-Za-z._-]/g, '_');
  const withExt = safe.toLowerCase().endsWith('.zip') ? safe : `${safe}.zip`;
  if (withExt === '.zip' || withExt === '') {
    throw new Error('Filename is invalid');
  }
  return withExt;
}

function normalizeLocationPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  if (!isAbsolute(trimmed)) {
    throw new Error('Location must be an absolute local filesystem path');
  }
  return normalize(resolve(trimmed));
}

function buildBackupFilePath(location: string, folderId: string, filename: string): string {
  return join(location, folderId, filename);
}

const activeJobControllers = new Map<string, AbortController>();

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('BACKUP_CANCELLED');
  }
}

/** Collections omitted from portable dumps (transient server state). */
const MONGO_BACKUP_EXCLUDE = new Set<string>(['backupjobs']);

/**
 * Exports each collection as a mongodump-style BSON stream: repeated
 * `[int32 little-endian total length including the 4 prefix bytes][bson payload]`.
 * Uses a single cursor per collection (natural order, no `$skip` pagination).
 */
async function dumpMongoCollectionsToBsonDir(params: {
  readonly mongoDir: string;
  readonly onCollectionDumped?: (
    completed: number,
    total: number,
    collectionName: string,
  ) => Promise<void> | void;
}): Promise<readonly string[]> {
  const { mongoDir, onCollectionDumped } = params;
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const cols = await db.listCollections().toArray();
  const names = cols
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !MONGO_BACKUP_EXCLUDE.has(n))
    .sort((a, b) => a.localeCompare(b));

  const cursorBatchSize = getMongoCursorBatchSize();
  const writeCollectionToBson = async (collectionName: string): Promise<void> => {
    const outPath = join(mongoDir, `${collectionName}.bson`);
    const writeStream = createWriteStream(outPath);
    const cursor = db.collection(collectionName).find<Document>({}, { batchSize: cursorBatchSize });
    for await (const doc of cursor) {
      const bsonBuffer = BSON.serialize(doc);
      const totalSize = 4 + bsonBuffer.length;
      const header = Buffer.allocUnsafe(4);
      header.writeInt32LE(totalSize, 0);
      if (!writeStream.write(header)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
      if (!writeStream.write(bsonBuffer)) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
    }
    writeStream.end();
    await finished(writeStream);
  };
  const width = getMongoExportConcurrency();
  const doneRef = { value: 0 };
  await runWithConcurrency(names, width, async (collectionName) => {
    await writeCollectionToBson(collectionName);
    doneRef.value += 1;
    if (onCollectionDumped != null) {
      await onCollectionDumped(doneRef.value, names.length, collectionName);
    }
  });
  return names;
}

async function* iterateBsonDocumentsFromFile(filePath: string): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(filePath);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, Buffer.from(chunk)]);
    while (buf.length >= 4) {
      const len = buf.readInt32LE(0);
      if (len < 5) {
        throw new Error(`Invalid BSON frame length ${String(len)} in ${filePath}`);
      }
      if (buf.length < len) {
        break;
      }
      const docBytes = buf.subarray(4, len);
      buf = buf.subarray(len);
      yield BSON.deserialize(docBytes) as Record<string, unknown>;
    }
  }
  if (buf.length > 0) {
    throw new Error(`Incomplete BSON tail in ${filePath}`);
  }
}

/**
 * Removes active backup jobs that cannot run under the current schema (missing path/filename),
 * e.g. documents created before those fields existed. Prevents stuck "in progress" rows and
 * validation errors on cancel/save.
 */
async function purgeMalformedActiveBackupJobs(): Promise<void> {
  const res = await BackupJob.deleteMany({
    status: { $in: ['pending', 'processing'] },
    $or: [
      { filename: { $exists: false } },
      { filename: null },
      { filename: '' },
      { location: { $exists: false } },
      { location: null },
      { location: '' },
    ],
  });
  if (res.deletedCount > 0) {
    logger.warn({ deletedCount: res.deletedCount }, 'Removed malformed in-progress backup job(s)');
  }
}

export async function listBackups(): Promise<BackupListEntry[]> {
  await purgeMalformedActiveBackupJobs();
  const jobs = await BackupJob.find({
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
    status: { $in: ['completed', 'processing', 'pending', 'failed', 'cancelled'] },
  })
    .sort({ createdAt: -1 })
    .lean();
  return jobs
    .filter((job) => job.result?.folderId != null || job.status === 'processing' || job.status === 'pending')
    .map((job) => {
      const result = job.result;
      const fallbackFolderId = `${job.createdAt.getTime()}_pending-${String(job._id)}`;
      const fallbackLocation = typeof job.location === 'string' && job.location.trim() !== '' ? job.location : '/unknown-location';
      const fallbackFilename = typeof job.filename === 'string' && job.filename.trim() !== '' ? job.filename : 'backup.zip';
      return {
        folderId: result?.folderId ?? fallbackFolderId,
        filePath: result?.filePath ?? buildBackupFilePath(fallbackLocation, fallbackFolderId, fallbackFilename),
        sizeBytes: result?.sizeBytes ?? 0,
        lastModified: (job.completedAt ?? job.updatedAt).toISOString(),
        status: job.status,
        progress: job.progress,
        jobId: String(job._id),
      };
    });
}

export async function deleteBackupFolder(folderId: string): Promise<void> {
  const docs = await BackupJob.find({
    'result.folderId': folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  })
    .sort({ completedAt: -1 })
    .lean();
  if (docs.length === 0) {
    return;
  }
  for (const doc of docs) {
    const filePath = doc.result?.filePath;
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      continue;
    }
    await rm(filePath, { force: true });
    await rm(dirname(filePath), { recursive: true, force: true });
  }
  await BackupJob.deleteMany({
    'result.folderId': folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  });
}

async function pruneOldBackups(retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const entries = await listBackups();
  let removed = 0;
  for (const e of entries) {
    const ms = backupFolderMillis(e.folderId);
    if (ms !== null && ms < cutoff) {
      await deleteBackupFolder(e.folderId);
      removed += 1;
    }
  }
  return removed;
}

export interface BackupProgressReporter {
  readonly report: (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ) => Promise<void>;
}

const BACKUP_PHASE_TOTAL = 5;

function progressRange(start: number, end: number, completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return Math.floor(start);
  }
  const ratio = Math.max(0, Math.min(1, completed / total));
  return Math.floor(start + (end - start) * ratio);
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
export async function executeFullBackupWithProgress(params: {
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
  readonly location: string;
  readonly signal: AbortSignal;
  readonly onProgress: BackupProgressReporter;
}): Promise<{ folderId: string; filePath: string; sizeBytes: number; prunedCount: number }> {
  const { onProgress: reporter } = params;
  const mongoDir = await mkdtemp(join(tmpdir(), 'atlboard-mongo-'));
  const minioMirrorDir = await mkdtemp(join(tmpdir(), 'atlboard-minio-mirror-'));
  const zipPath = join(tmpdir(), `atlboard-backup-${Date.now()}.zip`);
  let minioArchiveMethod: MinioArchiveMethod = 'mc-mirror-v1';
  try {
    throwIfCancelled(params.signal);
    await reporter.report('minio_export', 6, 0, BACKUP_PHASE_TOTAL);
    try {
      await mirrorMinioBucketsToWorkdir({
        minioRoot: minioMirrorDir,
        signal: params.signal,
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
      const isMcUnavailable =
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT';
      if (!isMcUnavailable) {
        throw error;
      }
      logger.warn({ error }, 'mc binary unavailable; falling back to MinIO SDK mirror');
      await mirrorMinioBucketsToWorkdirWithSdk({
        minioRoot: minioMirrorDir,
        signal: params.signal,
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
    const folderId = newBackupFolderId();
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

async function runBackupJobWorker(
  jobId: string,
  adminUserId: string,
  ipAddress: string | undefined,
): Promise<void> {
  const report = async (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ): Promise<void> => {
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'processing',
      startedAt: new Date(),
      currentPhase: phase,
      progress,
      processedItems,
      totalItems,
    });
  };
  try {
    const job = await BackupJob.findById(jobId).lean();
    if (!job) {
      return;
    }
    const loc = typeof job.location === 'string' ? job.location.trim() : '';
    const fn = typeof job.filename === 'string' ? job.filename.trim() : '';
    if (loc === '' || fn === '') {
      await BackupJob.deleteOne({ _id: jobId });
      logger.warn({ jobId }, 'Removed backup job missing location/filename (cannot run)');
      return;
    }
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);
    await report('queued', 2, 0, BACKUP_PHASE_TOTAL);
    const result = await executeFullBackupWithProgress({
      adminUserId,
      ipAddress,
      filename: job.filename,
      location: job.location,
      signal: controller.signal,
      onProgress: { report },
    });
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: BACKUP_PHASE_TOTAL,
      totalItems: BACKUP_PHASE_TOTAL,
      currentPhase: 'done',
      result,
      completedAt: new Date(),
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (failureMessage === 'BACKUP_CANCELLED') {
      await BackupJob.findByIdAndUpdate(jobId, {
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Backup was cancelled.',
        completedAt: new Date(),
      });
      return;
    }
    logger.error({ error, jobId }, 'Backup job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
    });
  } finally {
    activeJobControllers.delete(jobId);
  }
}

/**
 * Persists a backup job and runs the backup asynchronously on the server (client polls job status).
 * If this user already has a pending or processing job, returns that job id without starting another.
 */
export async function startBackupJob(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly filename: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  await purgeMalformedActiveBackupJobs();
  const location = requireBackupLocationFromEnv();
  const userOid = new mongoose.Types.ObjectId(params.userId);
  const existing = await BackupJob.findOne({
    userId: userOid,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
    status: { $in: ['pending', 'processing'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existing?._id != null) {
    return { jobId: String(existing._id), reusedExisting: true };
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const doc = await BackupJob.create({
    userId: userOid,
    jobKind: 'backup',
    status: 'pending',
    progress: 0,
    totalItems: BACKUP_PHASE_TOTAL,
    processedItems: 0,
    currentPhase: 'queued',
    filename: normalizeFilename(params.filename),
    location: normalizeLocationPath(location),
    expiresAt,
  });
  const jobId = doc._id.toString();
  void runBackupJobWorker(jobId, params.userId, params.ipAddress).catch((err: unknown) => {
    logger.error({ err, jobId }, 'Backup job worker crashed');
    void BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage: err instanceof Error ? err.message : String(err),
      progress: 0,
    });
  });
  return { jobId, reusedExisting: false };
}

export async function cancelBackupJob(jobId: string, userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(jobId)) {
    return false;
  }
  const userOid = new mongoose.Types.ObjectId(userId);
  const updated = await BackupJob.findOneAndUpdate(
    {
      _id: jobId,
      userId: userOid,
      status: { $in: ['pending', 'processing'] },
    },
    {
      $set: {
        cancelRequestedAt: new Date(),
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Backup was cancelled.',
        completedAt: new Date(),
      },
    },
    { new: false },
  );
  if (updated == null) {
    return false;
  }
  const controller = activeJobControllers.get(jobId);
  if (controller) {
    controller.abort();
  }
  return true;
}

export async function ensureBackupPath(locationInput: string): Promise<string> {
  const location = normalizeLocationPath(locationInput);
  await mkdir(location, { recursive: true });
  return location;
}

interface ParsedBackupManifest {
  readonly format: typeof BACKUP_FORMAT | typeof BACKUP_FORMAT_V1;
  readonly mongoCollections: readonly string[];
  readonly minioArchiveMethod: MinioArchiveMethod;
  readonly minioMetadataFile?: string;
}

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
    throw new Error('Invalid manifest: mongoCollections');
  }
  const fmt = parsed.format === BACKUP_FORMAT_V1 ? BACKUP_FORMAT_V1 : BACKUP_FORMAT;
  const minioArchiveMethod: MinioArchiveMethod =
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

async function restoreMongoFromDir(
  extractRoot: string,
  manifest: ParsedBackupManifest,
  onCollectionRestored?: (completed: number, total: number, collectionName: string) => Promise<void> | void,
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const mongoDir = join(extractRoot, 'mongo');
  let discovered: string[];
  try {
    const entries = await readdir(mongoDir);
    const fromBson = entries.filter((f) => f.endsWith('.bson')).map((f) => f.replace(/\.bson$/, ''));
    const fromNdjson = entries.filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));
    discovered = [...new Set([...fromBson, ...fromNdjson])];
  } catch {
    throw new Error('Backup archive is missing mongo/ dump');
  }
  const merged = [...new Set([...manifest.mongoCollections, ...discovered])];
  const ordered = sortCollectionsForRestore(merged);
  let restoredCollections = 0;

  for (const collectionName of ordered) {
    const coll = db.collection(collectionName);
    const bsonPath = join(mongoDir, `${collectionName}.bson`);
    const ndjsonPath = join(mongoDir, `${collectionName}.ndjson`);
    let hasBson = false;
    try {
      const st = await stat(bsonPath);
      hasBson = st.isFile();
    } catch {
      hasBson = false;
    }
    if (hasBson) {
      await coll.deleteMany({});
      const batch: Record<string, unknown>[] = [];
      const BATCH = getMongoInsertBatchSize();
      for await (const doc of iterateBsonDocumentsFromFile(bsonPath)) {
        batch.push(doc);
        if (batch.length >= BATCH) {
          await coll.insertMany(batch, { ordered: false });
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        await coll.insertMany(batch, { ordered: false });
      }
      restoredCollections += 1;
      if (onCollectionRestored != null) {
        await onCollectionRestored(restoredCollections, ordered.length, collectionName);
      }
      continue;
    }
    let text: string;
    try {
      text = await readFile(ndjsonPath, 'utf8');
    } catch {
      continue;
    }
    await coll.deleteMany({});
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const chunk = getMongoInsertBatchSize();
    for (let i = 0; i < lines.length; i += chunk) {
      const slice = lines.slice(i, i + chunk);
      const docs = slice.map((line) => EJSON.parse(line) as Record<string, unknown>);
      if (docs.length > 0) {
        await coll.insertMany(docs, { ordered: false });
      }
    }
    restoredCollections += 1;
    if (onCollectionRestored != null) {
      await onCollectionRestored(restoredCollections, ordered.length, collectionName);
    }
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
      return allowed.has(bucket) && bucket !== MINIO_BUCKET_BACKUPS;
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

const RESTORE_PHASE_TOTAL = 4;

export async function restoreFullBackup(params: {
  readonly folderId: string;
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
  readonly signal?: AbortSignal;
  readonly onProgress?: BackupProgressReporter;
}): Promise<void> {
  const doc = await BackupJob.findOne({ 'result.folderId': params.folderId }).sort({ completedAt: -1 }).lean();
  if (!doc?.result?.filePath) {
    throw new Error('Backup archive not found');
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

async function runRestoreJobWorker(
  jobId: string,
  adminUserId: string,
  ipAddress: string | undefined,
  sourceFolderId: string,
): Promise<void> {
  const report = async (
    phase: string,
    progress: number,
    processedItems: number,
    totalItems: number,
  ): Promise<void> => {
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'processing',
      startedAt: new Date(),
      currentPhase: phase,
      progress,
      processedItems,
      totalItems,
    });
  };
  try {
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);
    await report('queued', 1, 0, RESTORE_PHASE_TOTAL);
    await restoreFullBackup({
      folderId: sourceFolderId,
      adminUserId,
      ipAddress,
      signal: controller.signal,
      onProgress: { report },
    });
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      processedItems: RESTORE_PHASE_TOTAL,
      totalItems: RESTORE_PHASE_TOTAL,
      currentPhase: 'restore_done',
      completedAt: new Date(),
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (failureMessage === 'BACKUP_CANCELLED') {
      await BackupJob.findByIdAndUpdate(jobId, {
        status: 'cancelled',
        currentPhase: 'cancelled',
        failureMessage: 'Restore was cancelled.',
        completedAt: new Date(),
      });
      return;
    }
    logger.error({ error, jobId }, 'Restore job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
      completedAt: new Date(),
    });
  } finally {
    activeJobControllers.delete(jobId);
  }
}

export async function startRestoreJob(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
  readonly folderId: string;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
  const userOid = new mongoose.Types.ObjectId(params.userId);
  const existing = await BackupJob.findOne({
    userId: userOid,
    jobKind: 'restore',
    status: { $in: ['pending', 'processing'] },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (existing?._id != null) {
    return { jobId: String(existing._id), reusedExisting: true };
  }

  const source = await BackupJob.findOne({
    'result.folderId': params.folderId,
    $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
  })
    .sort({ completedAt: -1 })
    .lean();
  if (source?.result?.filePath == null || source.filename == null || source.location == null) {
    throw new Error('Backup archive not found');
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const doc = await BackupJob.create({
    userId: userOid,
    jobKind: 'restore',
    sourceFolderId: params.folderId,
    status: 'pending',
    progress: 0,
    totalItems: RESTORE_PHASE_TOTAL,
    processedItems: 0,
    currentPhase: 'queued',
    filename: source.filename,
    location: source.location,
    expiresAt,
  });
  const jobId = doc._id.toString();
  void runRestoreJobWorker(jobId, params.userId, params.ipAddress, params.folderId).catch((err: unknown) => {
    logger.error({ err, jobId }, 'Restore job worker crashed');
    void BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage: err instanceof Error ? err.message : String(err),
      progress: 0,
      completedAt: new Date(),
    });
  });
  return { jobId, reusedExisting: false };
}

export async function runScheduledBackupIfDue(): Promise<void> {
  const cfg = await getAdminConfig();
  const settings = cfg.backupSettings;
  const envLocation = getResolvedBackupLocationFromEnv();
  if (!settings?.scheduleEnabled || settings.scheduleFrequencyDays == null || envLocation == null) {
    return;
  }
  const last = settings.lastScheduledRunAt?.getTime() ?? 0;
  const dueAfterMs = settings.scheduleFrequencyDays * 24 * 60 * 60 * 1000;
  if (Date.now() - last < dueAfterMs) {
    return;
  }
  const userId = String(cfg.updatedBy);
  const { reusedExisting } = await startBackupJob({
    userId,
    filename: `scheduled-backup-${new Date().toISOString().slice(0, 10)}.zip`,
  });
  if (!reusedExisting) {
    if (cfg.backupSettings) {
      cfg.backupSettings.lastScheduledRunAt = new Date();
      cfg.markModified('backupSettings');
      await cfg.save();
    }
  }
}

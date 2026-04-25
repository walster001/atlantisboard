import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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

/** Current archive manifest format (BSON mongo + mc mirror minio). */
const BACKUP_FORMAT = 'atlboard-backup-v2' as const;
const BACKUP_FORMAT_V1 = 'atlboard-backup-v1' as const;

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

async function mirrorMinioBucketsToWorkdir(minioRoot: string, signal: AbortSignal): Promise<void> {
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const buckets = MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS);
  let i = 0;
  for (const bucket of buckets) {
    throwIfCancelled(signal);
    const dest = join(minioRoot, bucket);
    await mkdir(dest, { recursive: true });
    const src = `${mirrorAlias}/${bucket}`;
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', src, dest], { signal });
    i += 1;
    logger.info({ bucket, index: i, total: buckets.length }, 'mc mirror bucket complete');
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

const activeBackupControllers = new Map<string, AbortController>();

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
async function dumpMongoCollectionsToBsonDir(mongoDir: string): Promise<readonly string[]> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const cols = await db.listCollections().toArray();
  const names = cols
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !MONGO_BACKUP_EXCLUDE.has(n))
    .sort((a, b) => a.localeCompare(b));

  for (const collectionName of names) {
    const outPath = join(mongoDir, `${collectionName}.bson`);
    const writeStream = createWriteStream(outPath);
    const cursor = db.collection(collectionName).find<Document>({}, { batchSize: 500 });
    for await (const doc of cursor) {
      const bsonBuffer = BSON.serialize(doc);
      const totalSize = 4 + bsonBuffer.length;
      const header = Buffer.allocUnsafe(4);
      header.writeInt32LE(totalSize, 0);
      writeStream.write(header);
      writeStream.write(bsonBuffer);
    }
    await finished(writeStream);
  }
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
  const doc = await BackupJob.findOne({ 'result.folderId': folderId }).sort({ completedAt: -1 });
  if (!doc || !doc.result?.filePath) {
    return;
  }
  const filePath = doc.result.filePath;
  await rm(filePath, { force: true });
  await rm(dirname(filePath), { recursive: true, force: true });
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
  try {
    throwIfCancelled(params.signal);
    await reporter.report('mongo_export', 6, 0, BACKUP_PHASE_TOTAL);
    const collectionNames = await dumpMongoCollectionsToBsonDir(mongoDir);
    throwIfCancelled(params.signal);
    await reporter.report('mongo_export', 24, 1, BACKUP_PHASE_TOTAL);

    const manifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      mongoExportFormat: 'bson-v1',
      minioArchiveMethod: 'mc-mirror-v1',
      mongoCollections: collectionNames,
      minioBuckets: MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS),
    };

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err: Error) => {
      output.destroy(err);
    });
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.directory(mongoDir, 'mongo');

    await reporter.report('minio_archive', 30, 1, BACKUP_PHASE_TOTAL);
    await mirrorMinioBucketsToWorkdir(minioMirrorDir, params.signal);
    archive.directory(minioMirrorDir, 'minio');
    await reporter.report('minio_archive', 54, 2, BACKUP_PHASE_TOTAL);

    await reporter.report('zip_finalize', 62, 2, BACKUP_PHASE_TOTAL);
    await archive.finalize();
    await finished(output);
    throwIfCancelled(params.signal);
    await reporter.report('zip_finalize', 68, 3, BACKUP_PHASE_TOTAL);

    const st = await stat(zipPath);
    const folderId = newBackupFolderId();
    const filename = normalizeFilename(params.filename);
    const location = normalizeLocationPath(params.location);
    const filePath = buildBackupFilePath(location, folderId, filename);
    await mkdir(dirname(filePath), { recursive: true });
    await reporter.report('upload', 74, 3, BACKUP_PHASE_TOTAL);
    await copyFile(zipPath, filePath);
    throwIfCancelled(params.signal);
    await reporter.report('upload', 84, 4, BACKUP_PHASE_TOTAL);

    const cfg = await getAdminConfig();
    const retention = cfg.backupSettings?.retentionDays ?? 14;
    await reporter.report('retention', 90, 4, BACKUP_PHASE_TOTAL);
    const prunedCount = await pruneOldBackups(retention);
    await reporter.report('done', 97, 5, BACKUP_PHASE_TOTAL);

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
    activeBackupControllers.set(jobId, controller);
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
    activeBackupControllers.delete(jobId);
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
  const controller = activeBackupControllers.get(jobId);
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

type MinioArchiveMethod = 'sdk-stream-v1' | 'mc-mirror-v1';

interface ParsedBackupManifest {
  readonly format: typeof BACKUP_FORMAT | typeof BACKUP_FORMAT_V1;
  readonly mongoCollections: readonly string[];
  readonly minioArchiveMethod: MinioArchiveMethod;
}

async function readManifest(extractRoot: string): Promise<ParsedBackupManifest> {
  const raw = await readFile(join(extractRoot, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    format?: string;
    mongoCollections?: string[];
    mongoExportFormat?: string;
    minioArchiveMethod?: string;
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
  };
}

async function restoreMongoFromDir(extractRoot: string, manifest: ParsedBackupManifest): Promise<void> {
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
      const BATCH = 800;
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
    const chunk = 800;
    for (let i = 0; i < lines.length; i += chunk) {
      const slice = lines.slice(i, i + chunk);
      const docs = slice.map((line) => EJSON.parse(line) as Record<string, unknown>);
      if (docs.length > 0) {
        await coll.insertMany(docs, { ordered: false });
      }
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

async function restoreMinioFromDir(extractRoot: string, manifest: ParsedBackupManifest): Promise<void> {
  const root = join(extractRoot, 'minio');
  if (manifest.minioArchiveMethod === 'mc-mirror-v1') {
    const ac = new AbortController();
    await restoreMinioBucketsWithMcMirror(root, ac.signal);
    return;
  }
  const client = getMinIOClient();
  const rels = await walkRelativeFiles(root, '');
  const allowed = new Set<string>([...MINIO_BUCKET_NAMES]);
  for (const rel of rels) {
    const norm = rel.replace(/\\/g, '/');
    const slash = norm.indexOf('/');
    if (slash < 1) {
      continue;
    }
    const bucket = norm.slice(0, slash);
    const objectKey = norm.slice(slash + 1);
    if (!allowed.has(bucket) || bucket === MINIO_BUCKET_BACKUPS) {
      continue;
    }
    const filePath = join(root, norm);
    await client.fPutObject(bucket, objectKey, filePath);
  }
}

export async function restoreFullBackup(params: {
  readonly folderId: string;
  readonly adminUserId: string;
  readonly ipAddress?: string | undefined;
}): Promise<void> {
  const doc = await BackupJob.findOne({ 'result.folderId': params.folderId }).sort({ completedAt: -1 }).lean();
  if (!doc?.result?.filePath) {
    throw new Error('Backup archive not found');
  }
  const filePath = doc.result.filePath;
  const zipPath = join(tmpdir(), `restore-${Date.now()}.zip`);
  const extractDir = await mkdtemp(join(tmpdir(), 'atlboard-restore-'));
  try {
    await copyFile(filePath, zipPath);
    await pipeline(createReadStream(zipPath), unzipper.Extract({ path: extractDir }));
    const manifest = await readManifest(extractDir);
    await restoreMongoFromDir(extractDir, manifest);
    await restoreMinioFromDir(extractDir, manifest);
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

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { finished, pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import archiver from 'archiver';
import type { Archiver } from 'archiver';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import unzipper from 'unzipper';
import { MINIO_BUCKET_BACKUPS, MINIO_BUCKET_NAMES } from '../../shared/constants/minioBuckets.js';
import { getMinIOClient } from '../config/minio.js';
import { getAdminConfig } from './adminService.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { BackupJob } from '../models/BackupJob.js';

const BACKUP_FORMAT = 'atlboard-backup-v1' as const;
const ZIP_NAME = 'full-backup.zip' as const;

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
  readonly objectKey: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
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

function listObjectKeys(client: ReturnType<typeof getMinIOClient>, bucket: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const keys: string[] = [];
    const stream = client.listObjectsV2(bucket, '', true, '');
    stream.on('data', (obj: { name?: string }) => {
      if (obj.name && !obj.name.endsWith('/')) {
        keys.push(obj.name);
      }
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', reject);
  });
}

function appendReadableToArchive(archive: Archiver, stream: Readable, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      reject(err);
    };
    const onEnd = (): void => {
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      resolve();
    };
    stream.once('error', onError);
    stream.once('end', onEnd);
    archive.append(stream, { name });
  });
}

/** Collections omitted from portable dumps (transient server state). */
const MONGO_BACKUP_EXCLUDE = new Set<string>(['backupjobs']);

async function dumpMongoCollectionsToDir(mongoDir: string): Promise<readonly string[]> {
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
    const outPath = join(mongoDir, `${collectionName}.ndjson`);
    const writeStream = createWriteStream(outPath);
    const cursor = db.collection(collectionName).find({}, { batchSize: 200 });
    for await (const doc of cursor) {
      writeStream.write(`${EJSON.stringify(doc, { relaxed: true })}\n`);
    }
    await finished(writeStream);
  }
  return names;
}

export async function listBackups(): Promise<BackupListEntry[]> {
  const client = getMinIOClient();
  const keys = await listObjectKeys(client, MINIO_BUCKET_BACKUPS);
  const byFolder = new Map<string, { sizeBytes: number; lastModified: Date }>();
  for (const key of keys) {
    if (!key.endsWith(ZIP_NAME)) {
      continue;
    }
    const slash = key.indexOf('/');
    if (slash < 1) {
      continue;
    }
    const folderId = key.slice(0, slash);
    try {
      const st = await client.statObject(MINIO_BUCKET_BACKUPS, key);
      const prev = byFolder.get(folderId);
      const sizeBytes = st.size;
      const lastModified = st.lastModified;
      if (!prev) {
        byFolder.set(folderId, { sizeBytes, lastModified });
      } else {
        byFolder.set(folderId, {
          sizeBytes: prev.sizeBytes + sizeBytes,
          lastModified:
            lastModified.getTime() > prev.lastModified.getTime() ? lastModified : prev.lastModified,
        });
      }
    } catch (error) {
      logger.warn({ error, key }, 'Skipping backup object (stat failed)');
    }
  }
  return [...byFolder.entries()]
    .map(([folderId, v]) => ({
      folderId,
      objectKey: `${folderId}/${ZIP_NAME}`,
      sizeBytes: v.sizeBytes,
      lastModified: v.lastModified.toISOString(),
    }))
    .sort((a, b) => (backupFolderMillis(b.folderId) ?? 0) - (backupFolderMillis(a.folderId) ?? 0));
}

export async function deleteBackupFolder(folderId: string): Promise<void> {
  const client = getMinIOClient();
  const keys = await listObjectKeys(client, MINIO_BUCKET_BACKUPS);
  const prefix = `${folderId}/`;
  const toRemove = keys.filter((k) => k.startsWith(prefix));
  for (const name of toRemove) {
    await client.removeObject(MINIO_BUCKET_BACKUPS, name);
  }
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
  readonly onProgress: BackupProgressReporter;
}): Promise<{ folderId: string; objectKey: string; sizeBytes: number; prunedCount: number }> {
  const { onProgress: reporter } = params;
  const client = getMinIOClient();
  const mongoDir = await mkdtemp(join(tmpdir(), 'atlboard-mongo-'));
  const zipPath = join(tmpdir(), `atlboard-backup-${Date.now()}.zip`);
  try {
    await reporter.report('mongo_export', 6, 0, BACKUP_PHASE_TOTAL);
    const collectionNames = await dumpMongoCollectionsToDir(mongoDir);
    await reporter.report('mongo_export', 24, 1, BACKUP_PHASE_TOTAL);

    const manifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
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

    const buckets = MINIO_BUCKET_NAMES.filter((b) => b !== MINIO_BUCKET_BACKUPS);
    await reporter.report('minio_archive', 30, 1, BACKUP_PHASE_TOTAL);
    let bucketIndex = 0;
    for (const bucket of buckets) {
      const keys = await listObjectKeys(client, bucket);
      keys.sort((a, b) => a.localeCompare(b));
      for (const key of keys) {
        const stream = await client.getObject(bucket, key);
        await appendReadableToArchive(archive, stream, `minio/${bucket}/${key}`);
      }
      bucketIndex += 1;
      const span = 22;
      const pct = 30 + Math.floor((bucketIndex / Math.max(1, buckets.length)) * span);
      await reporter.report('minio_archive', Math.min(54, pct), 1, BACKUP_PHASE_TOTAL);
    }
    await reporter.report('minio_archive', 54, 2, BACKUP_PHASE_TOTAL);

    await reporter.report('zip_finalize', 62, 2, BACKUP_PHASE_TOTAL);
    await archive.finalize();
    await finished(output);
    await reporter.report('zip_finalize', 68, 3, BACKUP_PHASE_TOTAL);

    const st = await stat(zipPath);
    const folderId = newBackupFolderId();
    const objectKey = `${folderId}/${ZIP_NAME}`;
    await reporter.report('upload', 74, 3, BACKUP_PHASE_TOTAL);
    await client.fPutObject(MINIO_BUCKET_BACKUPS, objectKey, zipPath);
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
      metadata: { objectKey, sizeBytes: st.size, prunedCount },
      timestamp: new Date(),
    });

    return { folderId, objectKey, sizeBytes: st.size, prunedCount };
  } finally {
    await rm(mongoDir, { recursive: true, force: true });
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
      currentPhase: phase,
      progress,
      processedItems,
      totalItems,
    });
  };
  try {
    await report('queued', 2, 0, BACKUP_PHASE_TOTAL);
    const result = await executeFullBackupWithProgress({
      adminUserId,
      ipAddress,
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
    logger.error({ error, jobId }, 'Backup job failed');
    await BackupJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      currentPhase: 'failed',
      failureMessage,
      progress: 0,
    });
  }
}

/**
 * Persists a backup job and runs the backup asynchronously on the server (client polls job status).
 * If this user already has a pending or processing job, returns that job id without starting another.
 */
export async function startBackupJob(params: {
  readonly userId: string;
  readonly ipAddress?: string | undefined;
}): Promise<{ jobId: string; reusedExisting: boolean }> {
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

async function readManifest(extractRoot: string): Promise<{
  format: string;
  mongoCollections: string[];
}> {
  const raw = await readFile(join(extractRoot, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as { format?: string; mongoCollections?: string[] };
  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error(`Unsupported backup format: ${String(parsed.format)}`);
  }
  if (!Array.isArray(parsed.mongoCollections)) {
    throw new Error('Invalid manifest: mongoCollections');
  }
  return { format: parsed.format, mongoCollections: parsed.mongoCollections };
}

async function restoreMongoFromDir(extractRoot: string, manifestCollections: readonly string[]): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database is not connected');
  }
  const mongoDir = join(extractRoot, 'mongo');
  let names: string[];
  try {
    names = (await readdir(mongoDir)).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));
  } catch {
    throw new Error('Backup archive is missing mongo/ dump');
  }
  const merged = [...new Set([...manifestCollections, ...names])];
  const ordered = sortCollectionsForRestore(merged);

  for (const collectionName of ordered) {
    const path = join(mongoDir, `${collectionName}.ndjson`);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      continue;
    }
    const coll = db.collection(collectionName);
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

async function restoreMinioFromDir(extractRoot: string): Promise<void> {
  const client = getMinIOClient();
  const root = join(extractRoot, 'minio');
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
  const client = getMinIOClient();
  const objectKey = `${params.folderId}/${ZIP_NAME}`;
  const zipPath = join(tmpdir(), `restore-${Date.now()}.zip`);
  const extractDir = await mkdtemp(join(tmpdir(), 'atlboard-restore-'));
  try {
    await client.fGetObject(MINIO_BUCKET_BACKUPS, objectKey, zipPath);
    await pipeline(createReadStream(zipPath), unzipper.Extract({ path: extractDir }));
    const manifest = await readManifest(extractDir);
    await restoreMongoFromDir(extractDir, manifest.mongoCollections);
    await restoreMinioFromDir(extractDir);
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

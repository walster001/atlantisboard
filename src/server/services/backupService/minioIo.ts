import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MINIO_BUCKET_NAMES } from '../../../shared/constants/minioBuckets.js';
import type { BackupMinioSelection } from './backupMinioSelection.js';
import { getMinIOClient } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';
import {
  getMinioBucketMirrorConcurrency,
  getMinioObjectTransferConcurrency,
} from './runtime.js';
import { runWithConcurrency } from '../../../shared/utils/runWithConcurrency.js';

export type MinioArchiveMethod = 'sdk-stream-v1' | 'mc-mirror-v1';
export type MinioObjectMetadataMap = Record<string, Record<string, Record<string, string>>>;

export function allBucketBackupTargets(): readonly BackupMinioSelection[] {
  return MINIO_BUCKET_NAMES.map((bucket) => ({ bucket, prefix: '' }));
}

function mcMirrorSourcePath(mirrorAlias: string, target: BackupMinioSelection): string {
  if (target.prefix === '') {
    return `${mirrorAlias}/${target.bucket}`;
  }
  const trimmed = target.prefix.replace(/\/$/, '');
  return `${mirrorAlias}/${target.bucket}/${trimmed}`;
}

function mcMirrorDestPath(minioRoot: string, target: BackupMinioSelection): string {
  const bucketRoot = join(minioRoot, target.bucket);
  if (target.prefix === '') {
    return bucketRoot;
  }
  const trimmed = target.prefix.replace(/\/$/, '');
  return join(bucketRoot, trimmed);
}

function getMcMirrorConfig(): { readonly mcPath: string; readonly mirrorAlias: string } {
  const mcPath = (process.env.BACKUP_MC_PATH ?? 'mc').trim() || 'mc';
  const mirrorAlias = (process.env.BACKUP_MC_MIRROR_ALIAS ?? process.env.MINIO_MC_ALIAS ?? 'local').trim() || 'local';
  return { mcPath, mirrorAlias };
}

function buildMcMirrorEndpoint(): string {
  const explicit = process.env.BACKUP_MC_ENDPOINT?.trim();
  if (explicit != null && explicit !== '') {
    return explicit;
  }
  const host = process.env.MINIO_ENDPOINT?.trim() || 'localhost';
  const port = process.env.MINIO_PORT?.trim() || '9000';
  const ssl = process.env.MINIO_USE_SSL === 'true';
  return `${ssl ? 'https' : 'http'}://${host}:${port}`;
}

let mcMirrorAliasConfigured = false;

/** Test-only reset for alias configuration state. */
export function resetMcMirrorAliasConfiguredForTests(): void {
  mcMirrorAliasConfigured = false;
}

export async function ensureMcMirrorAliasConfigured(signal: AbortSignal): Promise<void> {
  if (mcMirrorAliasConfigured) {
    return;
  }
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim() ?? '';
  const secretKey = process.env.MINIO_SECRET_KEY?.trim() ?? '';
  if (accessKey === '' || secretKey === '') {
    logger.warn('MinIO credentials missing; mc mirror alias not configured');
    mcMirrorAliasConfigured = true;
    return;
  }
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const endpoint = buildMcMirrorEndpoint();
  try {
    await runMcCommand(mcPath, ['alias', 'set', mirrorAlias, endpoint, accessKey, secretKey], { signal });
    logger.info({ mirrorAlias, endpoint }, 'Configured mc mirror alias');
  } catch (error) {
    logger.warn({ error, mirrorAlias, endpoint }, 'Failed to configure mc mirror alias');
  }
  mcMirrorAliasConfigured = true;
}

function runMcCommand(mcPath: string, args: readonly string[], options: { readonly signal: AbortSignal }): Promise<void> {
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

export async function mirrorMinioBucketsToWorkdir(params: {
  readonly minioRoot: string;
  readonly signal: AbortSignal;
  readonly throwIfCancelled: (signal: AbortSignal) => void;
  readonly targets?: readonly BackupMinioSelection[];
  readonly onBucketMirrored?: (completed: number, total: number, bucket: string) => Promise<void> | void;
}): Promise<void> {
  const { minioRoot, signal, onBucketMirrored } = params;
  await ensureMcMirrorAliasConfigured(signal);
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const targets = params.targets ?? allBucketBackupTargets();
  if (targets.length === 0) {
    return;
  }
  const doneRef = { value: 0 };
  const width = getMinioBucketMirrorConcurrency();
  await runWithConcurrency(targets, width, async (target) => {
    params.throwIfCancelled(signal);
    const dest = mcMirrorDestPath(minioRoot, target);
    await mkdir(dest, { recursive: true });
    const src = mcMirrorSourcePath(mirrorAlias, target);
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', src, dest], { signal });
    doneRef.value += 1;
    logger.info(
      { bucket: target.bucket, prefix: target.prefix, index: doneRef.value, total: targets.length },
      'mc mirror target complete',
    );
    if (onBucketMirrored != null) {
      await onBucketMirrored(doneRef.value, targets.length, target.bucket);
    }
  });
}

async function listBucketObjectKeys(bucket: string, prefix = ''): Promise<string[]> {
  const client = getMinIOClient();
  const stream = client.listObjectsV2(bucket, prefix, true);
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
    if (key === 'content-type' || key === 'cache-control' || key.startsWith('x-amz-meta-')) {
      out[key] = v;
    }
  }
  return out;
}

export async function collectMinioObjectMetadataByBucket(
  buckets: readonly string[],
  targets?: readonly BackupMinioSelection[],
): Promise<MinioObjectMetadataMap> {
  const client = getMinIOClient();
  const out: MinioObjectMetadataMap = {};
  const resolvedTargets =
    targets ??
    buckets.map((bucket) => ({
      bucket: bucket as BackupMinioSelection['bucket'],
      prefix: '',
    }));
  for (const target of resolvedTargets) {
    const keys = await listBucketObjectKeys(target.bucket, target.prefix);
    const bucketMeta: Record<string, Record<string, string>> = {};
    const width = getMinioObjectTransferConcurrency();
    await runWithConcurrency(keys, width, async (key) => {
      try {
        const st = await client.statObject(target.bucket, key);
        const normalized = normalizeMinioStatMetadata(st.metaData as Record<string, string> | undefined);
        if (Object.keys(normalized).length > 0) {
          bucketMeta[key] = normalized;
        }
      } catch (error) {
        logger.warn({ error, bucket: target.bucket, key }, 'Failed to read MinIO object metadata during backup');
      }
    });
    if (Object.keys(bucketMeta).length > 0) {
      out[target.bucket] = { ...(out[target.bucket] ?? {}), ...bucketMeta };
    }
  }
  return out;
}

export function buildPutObjectMetadata(metadata: Record<string, string> | undefined): Record<string, string> | undefined {
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

export async function mirrorMinioBucketsToWorkdirWithSdk(params: {
  readonly minioRoot: string;
  readonly signal: AbortSignal;
  readonly throwIfCancelled: (signal: AbortSignal) => void;
  readonly targets?: readonly BackupMinioSelection[];
  readonly onBucketMirrored?: (completed: number, total: number, bucket: string) => Promise<void> | void;
}): Promise<void> {
  const { minioRoot, signal, onBucketMirrored } = params;
  const client = getMinIOClient();
  const targets = params.targets ?? allBucketBackupTargets();
  if (targets.length === 0) {
    return;
  }
  let completedTargets = 0;
  for (const target of targets) {
    params.throwIfCancelled(signal);
    const bucketDir = join(minioRoot, target.bucket);
    await mkdir(bucketDir, { recursive: true });
    const keys = await listBucketObjectKeys(target.bucket, target.prefix);
    const objectConcurrency = getMinioObjectTransferConcurrency();
    await runWithConcurrency(keys, objectConcurrency, async (key) => {
      params.throwIfCancelled(signal);
      const outPath = join(bucketDir, key);
      await mkdir(dirname(outPath), { recursive: true });
      await client.fGetObject(target.bucket, key, outPath);
    });
    completedTargets += 1;
    logger.info(
      { bucket: target.bucket, prefix: target.prefix, index: completedTargets, total: targets.length },
      'sdk mirror target complete',
    );
    if (onBucketMirrored != null) {
      await onBucketMirrored(completedTargets, targets.length, target.bucket);
    }
  }
}

export async function restoreMinioBucketsWithMcMirror(minioRoot: string, signal: AbortSignal): Promise<void> {
  await ensureMcMirrorAliasConfigured(signal);
  const { mcPath, mirrorAlias } = getMcMirrorConfig();
  const allowed = new Set<string>([...MINIO_BUCKET_NAMES]);
  let entries: string[];
  try {
    entries = await readdir(minioRoot);
  } catch {
    return;
  }
  for (const bucket of entries) {
    if (!allowed.has(bucket)) {
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
    const dest = `${mirrorAlias}/${bucket}`;
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', `${localBucketPath}/`, dest], { signal });
  }
}

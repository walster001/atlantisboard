import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MINIO_BUCKET_BACKUPS, MINIO_BUCKET_NAMES } from '../../../shared/constants/minioBuckets.js';
import { getMinIOClient } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';
import {
  getMinioBucketMirrorConcurrency,
  getMinioObjectTransferConcurrency,
  runWithConcurrency,
} from './runtime.js';

export type MinioArchiveMethod = 'sdk-stream-v1' | 'mc-mirror-v1';
export type MinioObjectMetadataMap = Record<string, Record<string, Record<string, string>>>;

function getMcMirrorConfig(): { readonly mcPath: string; readonly mirrorAlias: string } {
  const mcPath = (process.env.BACKUP_MC_PATH ?? 'mc').trim() || 'mc';
  const mirrorAlias = (process.env.BACKUP_MC_MIRROR_ALIAS ?? process.env.MINIO_MC_ALIAS ?? 'local').trim() || 'local';
  return { mcPath, mirrorAlias };
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
    params.throwIfCancelled(signal);
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
    if (key === 'content-type' || key === 'cache-control' || key.startsWith('x-amz-meta-')) {
      out[key] = v;
    }
  }
  return out;
}

export async function collectMinioObjectMetadataByBucket(buckets: readonly string[]): Promise<MinioObjectMetadataMap> {
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
    params.throwIfCancelled(signal);
    const bucketDir = join(minioRoot, bucket);
    await mkdir(bucketDir, { recursive: true });
    const keys = await listBucketObjectKeys(bucket);
    const objectConcurrency = getMinioObjectTransferConcurrency();
    await runWithConcurrency(keys, objectConcurrency, async (key) => {
      params.throwIfCancelled(signal);
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

export async function restoreMinioBucketsWithMcMirror(minioRoot: string, signal: AbortSignal): Promise<void> {
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
    const dest = `${mirrorAlias}/${bucket}`;
    await runMcCommand(mcPath, ['mirror', '--overwrite', '--preserve', `${localBucketPath}/`, dest], { signal });
  }
}

import { cpus } from 'node:os';

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

export function getMongoExportConcurrency(): number {
  const cpuCount = Math.max(1, cpus().length);
  const fallback = Math.min(4, cpuCount);
  return Math.max(1, Math.min(16, parsePositiveIntEnv('BACKUP_MONGO_EXPORT_CONCURRENCY', fallback)));
}

export function getMongoCursorBatchSize(): number {
  return Math.max(200, Math.min(10_000, parsePositiveIntEnv('BACKUP_MONGO_CURSOR_BATCH_SIZE', 1000)));
}

export function getMongoInsertBatchSize(): number {
  return Math.max(200, Math.min(10_000, parsePositiveIntEnv('BACKUP_MONGO_INSERT_BATCH_SIZE', 1200)));
}

export function getMinioBucketMirrorConcurrency(): number {
  return Math.max(1, Math.min(8, parsePositiveIntEnv('BACKUP_MINIO_BUCKET_CONCURRENCY', 2)));
}

export function getMinioObjectTransferConcurrency(): number {
  return Math.max(1, Math.min(32, parsePositiveIntEnv('BACKUP_MINIO_OBJECT_CONCURRENCY', 8)));
}

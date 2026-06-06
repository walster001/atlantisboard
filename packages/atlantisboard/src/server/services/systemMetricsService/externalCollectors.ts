import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { getMinIOClient } from '../../config/minio.js';
import { BackupJob } from '../../models/BackupJob.js';
import { logger } from '../../utils/logger.js';
import { parseCsvEnv } from './versionAndEnv.js';

const execFileAsync = promisify(execFile);

export async function readMongoDbVersion(): Promise<string | null> {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return null;
    }
    const res = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
    return typeof res.version === 'string' ? res.version : null;
  } catch (error) {
    logger.warn({ error }, 'Could not read MongoDB version for admin metrics');
    return null;
  }
}

export async function readMinioVersionLabel(): Promise<string | null> {
  try {
    const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = Number(process.env.MINIO_PORT) || 9000;
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const url = `${protocol}://${endPoint}:${port}/minio/health/live`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(url, { method: 'GET', signal: ac.signal });
    clearTimeout(t);
    const server = res.headers.get('server');
    if (server && server.trim() !== '') {
      return server.trim();
    }
    return res.ok ? 'connected' : `http_${res.status}`;
  } catch {
    try {
      await getMinIOClient().listBuckets();
      return 'connected';
    } catch {
      return null;
    }
  }
}

export async function readDatabaseSizeMb(): Promise<number | undefined> {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return undefined;
    }
    const stats = (await db.stats()) as { dataSize?: number; storageSize?: number };
    const source = typeof stats.storageSize === 'number' ? stats.storageSize : stats.dataSize;
    if (typeof source !== 'number' || !Number.isFinite(source) || source < 0) {
      return undefined;
    }
    return source / (1024 * 1024);
  } catch {
    return undefined;
  }
}

export async function readBackupCount(): Promise<number | undefined> {
  try {
    return await BackupJob.countDocuments({
      status: 'completed',
      $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
    });
  } catch {
    return undefined;
  }
}

export async function readDockerRunningContainerNames(): Promise<readonly string[] | undefined> {
  const envNames = parseCsvEnv('MONITOR_DOCKER_RUNNING_NAMES');
  if (envNames !== undefined) {
    return envNames;
  }
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}'], {
      timeout: 1200,
      windowsHide: true,
    });
    const names = stdout
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v !== '');
    return names.length > 0 ? names : undefined;
  } catch {
    return undefined;
  }
}

export function readDockerTotalsFromEnv(): { total?: number; running?: number } {
  const totalParsed = Number(process.env.MONITOR_DOCKER_TOTAL_CONTAINERS);
  const runningParsed = Number(process.env.MONITOR_DOCKER_RUNNING_CONTAINERS);
  return {
    ...(Number.isFinite(totalParsed) ? { total: totalParsed } : {}),
    ...(Number.isFinite(runningParsed) ? { running: runningParsed } : {}),
  };
}

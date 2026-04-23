import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import mongoose from 'mongoose';
import type { AdminSystemMetricsSnapshot } from '../../shared/types/adminSystemMetrics.js';
import { getMinIOClient } from '../config/minio.js';
import { logger } from '../utils/logger.js';

let lastCpuSample: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage } = {
  wallMs: Date.now(),
  cpu: process.cpuUsage(),
};

function readAppVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '../../../package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === 'string' && parsed.version.trim() !== ''
      ? parsed.version.trim()
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readLinuxMeminfoMb(): { memTotalMb: number; memAvailableMb: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/meminfo', 'utf8');
    let totalKb = 0;
    let availKb = 0;
    for (const line of text.split('\n')) {
      if (line.startsWith('MemTotal:')) {
        const m = /MemTotal:\s+(\d+)\s+kB/i.exec(line);
        if (m) totalKb = Number(m[1]);
      } else if (line.startsWith('MemAvailable:')) {
        const m = /MemAvailable:\s+(\d+)\s+kB/i.exec(line);
        if (m) availKb = Number(m[1]);
      }
    }
    if (totalKb <= 0 || availKb <= 0) {
      return undefined;
    }
    return { memTotalMb: totalKb / 1024, memAvailableMb: availKb / 1024 };
  } catch {
    return undefined;
  }
}

async function readMongoDbVersion(): Promise<string | null> {
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

async function readMinioVersionLabel(): Promise<string | null> {
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
      await new Promise<void>((resolve, reject) => {
        getMinIOClient().listBuckets((err, buckets) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
          void buckets;
        });
      });
      return 'connected';
    } catch {
      return null;
    }
  }
}

function sampleProcessCpu(): { cpuCoresApprox: number; cpuPercentOfSystem: number } {
  const nowWall = Date.now();
  const wallMs = Math.max(1, nowWall - lastCpuSample.wallMs);
  const delta = process.cpuUsage(lastCpuSample.cpu);
  lastCpuSample = { wallMs: nowWall, cpu: process.cpuUsage() };
  const cpuMicros = delta.user + delta.system;
  const cpuSec = cpuMicros / 1e6;
  const wallSec = wallMs / 1000;
  const cores = wallSec > 0 ? cpuSec / wallSec : 0;
  const logical = Math.max(1, os.cpus().length);
  const cpuPercentOfSystem = (cores / logical) * 100;
  return { cpuCoresApprox: cores, cpuPercentOfSystem };
}

export async function getAdminSystemMetricsSnapshot(): Promise<AdminSystemMetricsSnapshot> {
  const mem = process.memoryUsage();
  const cpu = sampleProcessCpu();
  const load = os.loadavg();
  const linuxMem = readLinuxMeminfoMb();
  const [mongoV, minioV] = await Promise.all([readMongoDbVersion(), readMinioVersionLabel()]);
  const bunVer = typeof Bun !== 'undefined' && typeof Bun.version === 'string' ? Bun.version : null;

  const load1m = load[0] ?? 0;
  const load5m = load[1] ?? 0;

  const system: AdminSystemMetricsSnapshot['system'] =
    linuxMem !== undefined
      ? { ...linuxMem, load1m, load5m }
      : { load1m, load5m };

  return {
    timestamp: new Date().toISOString(),
    process: {
      rssMb: mem.rss / (1024 * 1024),
      heapUsedMb: mem.heapUsed / (1024 * 1024),
      heapTotalMb: mem.heapTotal / (1024 * 1024),
      externalMb: mem.external / (1024 * 1024),
      cpuCoresApprox: cpu.cpuCoresApprox,
      cpuPercentOfSystem: cpu.cpuPercentOfSystem,
    },
    system,
    versions: {
      app: readAppVersion(),
      node: process.version,
      bun: bunVer,
      mongodb: mongoV,
      minio: minioV,
    },
  };
}

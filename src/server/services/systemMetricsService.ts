import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import type { AdminSystemMetricsSnapshot } from '../../shared/types/adminSystemMetrics.js';
import { getMinIOClient } from '../config/minio.js';
import { BackupJob } from '../models/BackupJob.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const APP_VERSION = readAppVersion();
const SLOW_METRICS_REFRESH_MS = 15_000;

let lastCpuSample: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage } = {
  wallMs: Date.now(),
  cpu: process.cpuUsage(),
};
let lastIoSample:
  | {
      readonly wallMs: number;
      readonly diskReadBytes: number;
      readonly diskWriteBytes: number;
      readonly netRxBytes: number;
      readonly netTxBytes: number;
    }
  | undefined;
let lastSlowMetricsSample:
  | ({
      readonly fetchedAt: number;
      readonly mongoVersion: string | null;
      readonly minioVersion: string | null;
      readonly disk?: { readonly totalMb: number; readonly usedMb: number };
      readonly databaseSizeMb?: number;
      readonly backupCount?: number;
      readonly hostTemperatureC?: number;
      readonly hostProcesses?: number;
      readonly dockerRunning?: number;
      readonly dockerTotal?: number;
      readonly dockerRunningContainers?: readonly string[];
    })
  | undefined;

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

function parseCsvEnv(name: string): readonly string[] | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
  return values.length > 0 ? values : undefined;
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
      await getMinIOClient().listBuckets();
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

function readHostTemperatureC(): number | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  const candidates = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/hwmon/hwmon0/temp1_input',
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf8').trim();
      const milli = Number(raw);
      if (Number.isFinite(milli) && milli > 0) {
        return milli / 1000;
      }
    } catch {
      // Try next source.
    }
  }
  return undefined;
}

function readProcessCountLinux(): number | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const entries = readdirSync('/proc', { withFileTypes: true });
    let count = 0;
    for (const ent of entries) {
      if (ent.isDirectory() && /^[0-9]+$/.test(ent.name)) {
        count += 1;
      }
    }
    return count;
  } catch {
    return undefined;
  }
}

async function readDiskTotalsMb(): Promise<{ totalMb: number; usedMb: number } | undefined> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '/']);
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lines.length < 2) {
      return undefined;
    }
    const cols = lines[1]!.split(/\s+/);
    const totalKb = Number(cols[1]);
    const usedKb = Number(cols[2]);
    if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb) || totalKb <= 0 || usedKb < 0) {
      return undefined;
    }
    return { totalMb: totalKb / 1024, usedMb: usedKb / 1024 };
  } catch {
    return undefined;
  }
}

function readLinuxDiskIoBytes(): { readBytes: number; writeBytes: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/diskstats', 'utf8');
    let readSectors = 0;
    let writeSectors = 0;
    for (const line of text.split('\n')) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 14) {
        continue;
      }
      const name = cols[2] ?? '';
      if (!/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/.test(name)) {
        continue;
      }
      readSectors += Number(cols[5] ?? 0);
      writeSectors += Number(cols[9] ?? 0);
    }
    return {
      readBytes: readSectors * 512,
      writeBytes: writeSectors * 512,
    };
  } catch {
    return undefined;
  }
}

function readLinuxNetworkIoBytes(): { rxBytes: number; txBytes: number } | undefined {
  if (process.platform !== 'linux') {
    return undefined;
  }
  try {
    const text = readFileSync('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const parts = line.trim().split(/[:\s]+/).filter((p) => p !== '');
      if (parts.length < 17) {
        continue;
      }
      const iface = parts[0] ?? '';
      if (iface === 'lo') {
        continue;
      }
      rx += Number(parts[1] ?? 0);
      tx += Number(parts[9] ?? 0);
    }
    return { rxBytes: rx, txBytes: tx };
  } catch {
    return undefined;
  }
}

function sampleLinuxIoRates(): {
  diskReadBytesPerSec?: number;
  diskWriteBytesPerSec?: number;
  networkRxBytesPerSec?: number;
  networkTxBytesPerSec?: number;
} {
  const disk = readLinuxDiskIoBytes();
  const net = readLinuxNetworkIoBytes();
  const nowMs = Date.now();
  const sample = {
    wallMs: nowMs,
    diskReadBytes: disk?.readBytes ?? 0,
    diskWriteBytes: disk?.writeBytes ?? 0,
    netRxBytes: net?.rxBytes ?? 0,
    netTxBytes: net?.txBytes ?? 0,
  };
  const prev = lastIoSample;
  lastIoSample = sample;
  if (prev == null) {
    return {};
  }
  const dt = Math.max(1, (sample.wallMs - prev.wallMs) / 1000);
  return {
    diskReadBytesPerSec: Math.max(0, (sample.diskReadBytes - prev.diskReadBytes) / dt),
    diskWriteBytesPerSec: Math.max(0, (sample.diskWriteBytes - prev.diskWriteBytes) / dt),
    networkRxBytesPerSec: Math.max(0, (sample.netRxBytes - prev.netRxBytes) / dt),
    networkTxBytesPerSec: Math.max(0, (sample.netTxBytes - prev.netTxBytes) / dt),
  };
}

async function readDatabaseSizeMb(): Promise<number | undefined> {
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

async function readBackupCount(): Promise<number | undefined> {
  try {
    return await BackupJob.countDocuments({
      status: 'completed',
      $or: [{ jobKind: 'backup' }, { jobKind: { $exists: false } }],
    });
  } catch {
    return undefined;
  }
}

async function readDockerRunningContainerNames(): Promise<readonly string[] | undefined> {
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

function readDockerTotalsFromEnv(): { total?: number; running?: number } {
  const totalParsed = Number(process.env.MONITOR_DOCKER_TOTAL_CONTAINERS);
  const runningParsed = Number(process.env.MONITOR_DOCKER_RUNNING_CONTAINERS);
  return {
    ...(Number.isFinite(totalParsed) ? { total: totalParsed } : {}),
    ...(Number.isFinite(runningParsed) ? { running: runningParsed } : {}),
  };
}

async function getSlowMetricsSample(): Promise<NonNullable<typeof lastSlowMetricsSample>> {
  const now = Date.now();
  if (lastSlowMetricsSample != null && now - lastSlowMetricsSample.fetchedAt < SLOW_METRICS_REFRESH_MS) {
    return lastSlowMetricsSample;
  }
  const [mongoVersion, minioVersion, disk, databaseSizeMb, backupCount, dockerRunningContainers] =
    await Promise.all([
      readMongoDbVersion(),
      readMinioVersionLabel(),
      readDiskTotalsMb(),
      readDatabaseSizeMb(),
      readBackupCount(),
      readDockerRunningContainerNames(),
    ]);
  const dockerEnv = readDockerTotalsFromEnv();
  const runningByList = dockerRunningContainers?.length;
  const dockerRunning = dockerEnv.running ?? runningByList ?? 5;
  const dockerTotal = dockerEnv.total ?? (runningByList ?? dockerRunning);
  const hostTemperatureC = readHostTemperatureC();
  const hostProcesses = readProcessCountLinux();
  const sample = {
    fetchedAt: now,
    mongoVersion,
    minioVersion,
    ...(disk !== undefined ? { disk } : {}),
    ...(databaseSizeMb !== undefined ? { databaseSizeMb } : {}),
    ...(backupCount !== undefined ? { backupCount } : {}),
    ...(hostTemperatureC !== undefined ? { hostTemperatureC } : {}),
    ...(hostProcesses !== undefined ? { hostProcesses } : {}),
    dockerRunning,
    dockerTotal,
    ...(dockerRunningContainers !== undefined ? { dockerRunningContainers } : {}),
  } as const;
  lastSlowMetricsSample = sample;
  return sample;
}

export async function getAdminSystemMetricsSnapshot(): Promise<AdminSystemMetricsSnapshot> {
  const mem = process.memoryUsage();
  const cpu = sampleProcessCpu();
  const load = os.loadavg();
  const linuxMem = readLinuxMeminfoMb();
  const slow = await getSlowMetricsSample();
  const bunGlobal = globalThis as typeof globalThis & { Bun?: { version?: string } };
  const bunVer =
    typeof bunGlobal.Bun?.version === 'string' && bunGlobal.Bun.version.trim() !== ''
      ? bunGlobal.Bun.version.trim()
      : null;

  const load1m = load[0] ?? 0;
  const load5m = load[1] ?? 0;

  const ioRates = sampleLinuxIoRates();

  const system: AdminSystemMetricsSnapshot['system'] =
    linuxMem !== undefined
      ? {
          ...linuxMem,
          load1m,
          load5m,
          ...(slow.disk !== undefined
            ? { diskTotalMb: slow.disk.totalMb, diskUsedMb: slow.disk.usedMb }
            : {}),
          ...(ioRates.diskReadBytesPerSec !== undefined ? { diskReadBytesPerSec: ioRates.diskReadBytesPerSec } : {}),
          ...(ioRates.diskWriteBytesPerSec !== undefined ? { diskWriteBytesPerSec: ioRates.diskWriteBytesPerSec } : {}),
          ...(ioRates.networkRxBytesPerSec !== undefined ? { networkRxBytesPerSec: ioRates.networkRxBytesPerSec } : {}),
          ...(ioRates.networkTxBytesPerSec !== undefined ? { networkTxBytesPerSec: ioRates.networkTxBytesPerSec } : {}),
        }
      : { load1m, load5m };

  return {
    timestamp: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      kernel: os.release(),
      processor: os.cpus()[0]?.model ?? 'Unknown',
      ...(slow.hostTemperatureC !== undefined ? { temperatureC: slow.hostTemperatureC } : {}),
      ...(slow.hostProcesses !== undefined ? { processes: slow.hostProcesses } : {}),
    },
    process: {
      rssMb: mem.rss / (1024 * 1024),
      heapUsedMb: mem.heapUsed / (1024 * 1024),
      heapTotalMb: mem.heapTotal / (1024 * 1024),
      externalMb: mem.external / (1024 * 1024),
      cpuCoresApprox: cpu.cpuCoresApprox,
      cpuPercentOfSystem: cpu.cpuPercentOfSystem,
    },
    system,
    runtime: {
      uptimeSec: process.uptime(),
      ...(slow.databaseSizeMb !== undefined ? { databaseSizeMb: slow.databaseSizeMb } : {}),
      ...(slow.dockerRunning !== undefined ? { dockerRunning: slow.dockerRunning } : {}),
      ...(slow.dockerTotal !== undefined ? { dockerTotal: slow.dockerTotal } : {}),
      ...(slow.backupCount !== undefined ? { backupCount: slow.backupCount } : {}),
      ...(slow.dockerRunningContainers !== undefined
        ? { dockerRunningContainers: slow.dockerRunningContainers }
        : {}),
    },
    versions: {
      app: APP_VERSION,
      node: process.version,
      bun: bunVer,
      mongodb: slow.mongoVersion,
      minio: slow.minioVersion,
    },
  };
}

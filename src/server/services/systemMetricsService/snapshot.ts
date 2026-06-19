import os from 'node:os';
import type { AdminSystemMetricsSnapshot } from '../../../shared/types/adminSystemMetrics.js';
import { metricsCache, SLOW_METRICS_REFRESH_MS } from './state.js';
import { APP_VERSION } from './versionAndEnv.js';
import {
  getClamAvDbDirForMetrics,
  readDiskTotalsMb,
  readDiskTotalsMbForPath,
  readHostTemperatureC,
  readLinuxMeminfoMb,
  readProcessCountLinux,
  sampleLinuxIoRates,
  sampleProcessCpu,
} from './hostCollectors.js';
import {
  readBackupCount,
  readDatabaseSizeMb,
  readDockerRunningContainerNames,
  readDockerTotalsFromEnv,
  readMinioVersionLabel,
  readMongoDbVersion,
} from './externalCollectors.js';

async function getSlowMetricsSample(): Promise<NonNullable<typeof metricsCache.lastSlowMetricsSample>> {
  const now = Date.now();
  if (
    metricsCache.lastSlowMetricsSample != null &&
    now - metricsCache.lastSlowMetricsSample.fetchedAt < SLOW_METRICS_REFRESH_MS
  ) {
    return metricsCache.lastSlowMetricsSample;
  }
  const clamavDbDir = getClamAvDbDirForMetrics();
  const [mongoVersion, minioVersion, disk, clamavDisk, databaseSizeMb, backupCount, dockerRunningContainers] =
    await Promise.all([
      readMongoDbVersion(),
      readMinioVersionLabel(),
      readDiskTotalsMb(),
      readDiskTotalsMbForPath(clamavDbDir),
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
    ...(clamavDisk !== undefined ? { clamavDisk } : {}),
    ...(databaseSizeMb !== undefined ? { databaseSizeMb } : {}),
    ...(backupCount !== undefined ? { backupCount } : {}),
    ...(hostTemperatureC !== undefined ? { hostTemperatureC } : {}),
    ...(hostProcesses !== undefined ? { hostProcesses } : {}),
    dockerRunning,
    dockerTotal,
    ...(dockerRunningContainers !== undefined ? { dockerRunningContainers } : {}),
  } as const;
  metricsCache.lastSlowMetricsSample = sample;
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
          ...(slow.clamavDisk !== undefined
            ? {
                clamavDiskTotalMb: slow.clamavDisk.totalMb,
                clamavDiskUsedMb: slow.clamavDisk.usedMb,
              }
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

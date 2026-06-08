import type { MetricsHistoryEntry } from '../../../shared/types/adminSystemMetrics.js';
import { getSocketIO } from '../../utils/socketIO.js';
import { lastSlowMetricsSample } from './state.js';
import { readLinuxMeminfoMb, sampleProcessCpu } from './hostCollectors.js';
import { getAdminSystemMetricsSnapshot } from './snapshot.js';

const SAMPLE_INTERVAL_MS = 1_000;
const SAMPLE_CAPACITY = 300;
const TREND_EMIT_EVERY = 10;
const ADMIN_MONITOR_ROOM = 'admin:monitor';

const sampleBuffer: MetricsHistoryEntry[] = [];
let sampleTickCount = 0;
let snapshotInFlight = false;
let collectionTimer: ReturnType<typeof setInterval> | undefined;

function collectSample(): void {
  const cpu = sampleProcessCpu();
  const mem = process.memoryUsage();
  const linuxMem = readLinuxMeminfoMb();

  let hostMemUsedPercent = 0;
  let hostMemUsedMb = 0;
  let hostMemTotalMb = 0;
  if (linuxMem != null && linuxMem.memTotalMb > 0) {
    hostMemUsedMb = Math.max(0, linuxMem.memTotalMb - linuxMem.memAvailableMb);
    hostMemTotalMb = linuxMem.memTotalMb;
    hostMemUsedPercent = Math.max(
      0,
      Math.min(100, (hostMemUsedMb / hostMemTotalMb) * 100),
    );
  }

  let diskUsedPercent = 0;
  let diskUsedMb = 0;
  let diskTotalMb = 0;
  const disk = lastSlowMetricsSample?.disk;
  if (disk != null && disk.totalMb > 0) {
    diskUsedMb = disk.usedMb;
    diskTotalMb = disk.totalMb;
    diskUsedPercent = Math.max(0, Math.min(100, (diskUsedMb / diskTotalMb) * 100));
  }

  const entry: MetricsHistoryEntry = {
    timestamp: new Date().toISOString(),
    cpuPercent: cpu.cpuPercentOfSystem,
    hostMemUsedPercent,
    hostMemUsedMb,
    hostMemTotalMb,
    diskUsedPercent,
    diskUsedMb,
    diskTotalMb,
    rssMb: mem.rss / (1024 * 1024),
  };

  if (sampleBuffer.length >= SAMPLE_CAPACITY) {
    sampleBuffer.shift();
  }
  sampleBuffer.push(entry);

  emitSampleToSubscribers(entry);
}

function emitSampleToSubscribers(entry: MetricsHistoryEntry): void {
  const io = getSocketIO();
  if (io == null) {
    return;
  }
  const rooms = io.sockets?.adapter?.rooms;
  if (rooms == null) {
    return;
  }
  const room = rooms.get(ADMIN_MONITOR_ROOM);
  if (room == null || room.size === 0) {
    return;
  }
  if (snapshotInFlight) {
    io.to(ADMIN_MONITOR_ROOM).emit('admin:monitor:stats', { snapshot: null, entry, isTrendTick: false });
    return;
  }
  sampleTickCount += 1;
  const isTrendTick = sampleTickCount >= TREND_EMIT_EVERY;
  if (isTrendTick) {
    sampleTickCount = 0;
  }
  snapshotInFlight = true;
  void getAdminSystemMetricsSnapshot()
    .then((snapshot) => {
      io.to(ADMIN_MONITOR_ROOM).emit('admin:monitor:stats', { snapshot, entry, isTrendTick });
    })
    .catch(() => {
      io.to(ADMIN_MONITOR_ROOM).emit('admin:monitor:stats', { snapshot: null, entry, isTrendTick });
    })
    .finally(() => {
      snapshotInFlight = false;
    });
}

/**
 * Returns downsampled trend points (every 10th sample) for pre-populating
 * the client chart. At most 30 entries covering ~5 minutes.
 */
export function getMetricsHistory(): readonly MetricsHistoryEntry[] {
  if (sampleBuffer.length === 0) {
    return [];
  }
  const step = TREND_EMIT_EVERY;
  const startOffset = (sampleBuffer.length - 1) % step;
  const result: MetricsHistoryEntry[] = [];
  for (let i = startOffset; i < sampleBuffer.length; i += step) {
    result.push(sampleBuffer[i]!);
  }
  return result;
}

export function getAdminMonitorRoom(): string {
  return ADMIN_MONITOR_ROOM;
}

export function startMetricsCollection(): void {
  if (collectionTimer != null) {
    return;
  }
  collectSample();
  collectionTimer = setInterval(collectSample, SAMPLE_INTERVAL_MS);
  if (typeof collectionTimer === 'object' && 'unref' in collectionTimer) {
    collectionTimer.unref();
  }
}

export function stopMetricsCollection(): void {
  if (collectionTimer == null) {
    return;
  }
  clearInterval(collectionTimer);
  collectionTimer = undefined;
}

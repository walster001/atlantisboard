import type {
  AdminSystemMetricsSnapshot,
  MetricsHistoryEntry,
} from '../../../../shared/types/adminSystemMetrics.js';
import type { MonitorPoint } from './types.js';

export const COLLECTION_INTERVAL_S = 10;
export const HISTORY_CAP = 30;

/** Local browser time for trend chart axis labels (12-hour clock). */
export function formatTrendAxisTime(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (!Number.isFinite(d.getTime())) {
    return '—';
  }
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatShortTime(iso: string): string {
  return formatTrendAxisTime(iso);
}

export function formatGbOneDecimalFromMb(mb: number): string {
  if (typeof mb !== 'number' || !Number.isFinite(mb)) {
    return 'N/A';
  }
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatGbOneDecimal(gb: number): string {
  if (typeof gb !== 'number' || !Number.isFinite(gb)) {
    return 'N/A';
  }
  return `${gb.toFixed(1)} GB`;
}

/** Compact numeric label for chart Y-axis ticks (unit shown separately). */
export function formatCapacityAxisTick(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (value >= 100) {
    return String(Math.round(value));
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

export function formatMemoryUsedTotalLabel(usedMb: number, totalMb: number): string {
  if (totalMb <= 0) {
    return `${formatGbOneDecimalFromMb(usedMb)} used`;
  }
  return `${formatGbOneDecimalFromMb(usedMb)} / ${formatGbOneDecimalFromMb(totalMb)}`;
}

export function capacityGbFromMb(totalMb: number): number {
  return roundUpToEven(Math.ceil(mbToGb(Math.max(totalMb, 1))));
}

export function formatDiskUsedTotalLabelGb(usedMb: number, totalMb: number): string {
  const usedGb = usedMb / 1024;
  const totalGb = totalMb / 1024;
  if (totalMb <= 0) {
    return `${usedGb.toFixed(1)} GB used`;
  }
  return `${usedGb.toFixed(1)} GB / ${totalGb.toFixed(1)} GB`;
}

export function mbToGb(mb: number): number {
  return mb / 1024;
}

/** Smallest even integer >= value (for fixed capacity axis ceilings). */
export function roundUpToEven(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 2;
  }
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Evenly spaced even-integer ticks from 0 through max (inclusive). */
export function buildEvenAxisTicks(maxValue: number, desiredTickCount = 5): number[] {
  const evenMax = roundUpToEven(maxValue);
  if (desiredTickCount <= 2) {
    return [0, evenMax];
  }
  const slotCount = desiredTickCount - 1;
  const rawStep = evenMax / slotCount;
  const step = Math.max(2, roundUpToEven(rawStep));
  const ticks: number[] = [0];
  let value = step;
  while (value < evenMax) {
    ticks.push(value);
    value += step;
  }
  ticks.push(evenMax);
  return ticks;
}

export const CPU_TREND_Y_TICKS = [0, 20, 40, 60, 80, 100] as const;

export function toMonitorPointFields(
  entry: Pick<
    MetricsHistoryEntry,
    | 'cpuPercent'
    | 'hostMemUsedPercent'
    | 'hostMemUsedMb'
    | 'hostMemTotalMb'
    | 'diskUsedPercent'
    | 'diskUsedMb'
    | 'diskTotalMb'
  > &
    Partial<
      Pick<
        MetricsHistoryEntry,
        'hostMemUsedMb' | 'hostMemTotalMb' | 'diskUsedMb' | 'diskTotalMb'
      >
    >,
): Pick<
  MonitorPoint,
  | 'cpuPercent'
  | 'memoryUsedPercent'
  | 'diskUsedPercent'
  | 'hostMemUsedPercent'
  | 'hostMemUsedMb'
  | 'hostMemTotalMb'
  | 'hostMemUsedGb'
  | 'hostMemTotalGb'
  | 'diskUsedMb'
  | 'diskTotalMb'
  | 'diskUsedGb'
  | 'diskTotalGb'
> {
  const hostMemUsedMb = entry.hostMemUsedMb ?? 0;
  const hostMemTotalMb = entry.hostMemTotalMb ?? 0;
  const diskUsedMb = entry.diskUsedMb ?? 0;
  const diskTotalMb = entry.diskTotalMb ?? 0;
  const hostMemUsedGb = mbToGb(hostMemUsedMb);
  const hostMemTotalGb = mbToGb(hostMemTotalMb);
  return {
    cpuPercent: entry.cpuPercent,
    memoryUsedPercent: entry.hostMemUsedPercent,
    diskUsedPercent: entry.diskUsedPercent,
    hostMemUsedPercent: entry.hostMemUsedPercent,
    hostMemUsedMb,
    hostMemTotalMb,
    hostMemUsedGb,
    hostMemTotalGb,
    diskUsedMb,
    diskTotalMb,
    diskUsedGb: mbToGb(diskUsedMb),
    diskTotalGb: mbToGb(diskTotalMb),
  };
}

export function metricsEntryToMonitorPoint(entry: MetricsHistoryEntry): MonitorPoint {
  return {
    t: formatShortTime(entry.timestamp),
    ts: Date.parse(entry.timestamp),
    ...toMonitorPointFields(entry),
  };
}

export function normalizeMonitorHistory(points: readonly MonitorPoint[]): MonitorPoint[] {
  const sorted = points
    .filter((point) => Number.isFinite(point.ts))
    .slice()
    .sort((a, b) => a.ts - b.ts);
  return sorted.length > HISTORY_CAP ? sorted.slice(sorted.length - HISTORY_CAP) : sorted;
}

export function pushPoint(prev: readonly MonitorPoint[], next: MonitorPoint): MonitorPoint[] {
  const merged = [...prev, next];
  return merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged;
}

export function formatNumber(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return 'N/A';
  }
  return Math.round(n).toLocaleString();
}

export function formatPercent(n: number | undefined, decimals = 0, fallback = 'N/A'): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return fallback;
  }
  return `${n.toFixed(decimals)}%`;
}

export function formatBytesPerSecond(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    return 'N/A';
  }
  const mb = n / (1024 * 1024);
  if (mb < 1) {
    return `${Math.round(n / 1024)} KB/s`;
  }
  if (mb <= 1000) {
    return `${Math.round(mb)} MB/s`;
  }
  return `${Math.round(mb / 1024)} GB/s`;
}

export function formatUptimeCompact(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'N/A';
  }
  const total = Math.floor(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function hostMemUsedPercent(snapshot: AdminSystemMetricsSnapshot): number {
  const total = snapshot.system?.memTotalMb;
  const avail = snapshot.system?.memAvailableMb;
  if (typeof total !== 'number' || typeof avail !== 'number' || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((total - avail) / total) * 100));
}

export function hostDiskUsedPercent(snapshot: AdminSystemMetricsSnapshot): number {
  const total = snapshot.system?.diskTotalMb;
  const used = snapshot.system?.diskUsedMb;
  if (typeof total !== 'number' || typeof used !== 'number' || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (used / total) * 100));
}

export function displayStorageFromMb(mb: number): string {
  if (mb > 1000) {
    return `${Math.round(mb / 1024)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function appendTrendPoint(
  prev: readonly MonitorPoint[],
  next: Omit<MonitorPoint, 't'> & { readonly isoTime: string },
): MonitorPoint[] {
  const nextPoint: MonitorPoint = { ...next, t: formatShortTime(next.isoTime) };
  return pushPoint(prev as MonitorPoint[], nextPoint);
}

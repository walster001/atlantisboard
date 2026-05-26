import type { AdminSystemMetricsSnapshot } from '../../../../shared/types/adminSystemMetrics.js';
import type { MonitorPoint } from './types.js';

export const COLLECTION_INTERVAL_S = 10;
const TREND_POINT_MS = COLLECTION_INTERVAL_S * 1000;
export const HISTORY_CAP = 30;

export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}:${ss}`;
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
  if (prev.length === 0) {
    const baselineTs = next.ts - TREND_POINT_MS;
    const baselineIso = new Date(baselineTs).toISOString();
    const baseline: MonitorPoint = {
      t: formatShortTime(baselineIso),
      ts: baselineTs,
      cpuPercent: 0,
      memoryUsedPercent: 0,
      diskUsedPercent: 0,
      hostMemUsedPercent: 0,
    };
    return pushPoint([baseline], nextPoint);
  }
  return pushPoint(prev as MonitorPoint[], nextPoint);
}

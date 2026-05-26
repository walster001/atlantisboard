import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Group, Stack, Text, Title } from '@mantine/core';
import type { AdminSystemMetricsSnapshot, MetricsHistoryEntry } from '../../../shared/types/adminSystemMetrics.js';
import { api } from '../../utils/api.js';
import { socketClient } from '../../utils/socket.js';
import { HostAndUsageSection } from './monitor/HostAndUsageSection.js';
import { TrendsAndRuntimeSection } from './monitor/TrendsAndRuntimeSection.js';
import type { MonitorPoint } from './monitor/types.js';
import { COLLECTION_INTERVAL_S, HISTORY_CAP, appendTrendPoint, formatShortTime, hostDiskUsedPercent, hostMemUsedPercent } from './monitor/utils.js';

function buildZeroFilledHistory(): MonitorPoint[] {
  const now = Date.now();
  const intervalMs = COLLECTION_INTERVAL_S * 1000;
  const points: MonitorPoint[] = [];
  for (let i = HISTORY_CAP - 1; i >= 0; i--) {
    const ts = now - i * intervalMs;
    points.push({
      t: formatShortTime(new Date(ts).toISOString()),
      ts,
      cpuPercent: 0,
      memoryUsedPercent: 0,
      diskUsedPercent: 0,
      hostMemUsedPercent: 0,
    });
  }
  return points;
}

function historyEntriesToPoints(entries: readonly MetricsHistoryEntry[]): MonitorPoint[] {
  const filled = buildZeroFilledHistory();
  if (entries.length === 0) {
    return filled;
  }
  const real = entries.map((e) => ({
    t: formatShortTime(e.timestamp),
    ts: Date.parse(e.timestamp),
    cpuPercent: e.cpuPercent,
    memoryUsedPercent: e.hostMemUsedPercent,
    diskUsedPercent: e.diskUsedPercent,
    hostMemUsedPercent: e.hostMemUsedPercent,
  }));
  const merged = [...filled, ...real];
  return merged.slice(merged.length - HISTORY_CAP);
}

interface MonitorStatsPayload {
  readonly snapshot: AdminSystemMetricsSnapshot | null;
  readonly entry: MetricsHistoryEntry;
  readonly isTrendTick: boolean;
}

export const AdminMonitorPanel = memo(function AdminMonitorPanel() {
  const [latest, setLatest] = useState<AdminSystemMetricsSnapshot | null>(null);
  const [history, setHistory] = useState<MonitorPoint[]>(buildZeroFilledHistory);
  const historyLoadedRef = useRef(false);

  useEffect(() => {
    if (historyLoadedRef.current) {
      return;
    }
    historyLoadedRef.current = true;
    void api.getAdminSystemMetricsHistory().then((entries) => {
      setHistory(historyEntriesToPoints(entries));
    }).catch(() => {
      // Best-effort; socket will deliver live updates regardless.
    });
  }, []);

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (socket == null) {
      return;
    }

    const onStats = (data: MonitorStatsPayload): void => {
      if (data.snapshot != null) {
        setLatest(data.snapshot);
      }
      if (data.isTrendTick) {
        setHistory((prev) =>
          appendTrendPoint(prev, {
            isoTime: data.entry.timestamp,
            ts: Date.parse(data.entry.timestamp),
            cpuPercent: data.entry.cpuPercent,
            memoryUsedPercent: data.entry.hostMemUsedPercent,
            diskUsedPercent: data.entry.diskUsedPercent,
            hostMemUsedPercent: data.entry.hostMemUsedPercent,
          }),
        );
      }
    };

    socket.emit('admin:monitor:subscribe');
    socket.on('admin:monitor:stats', onStats);

    return () => {
      socket.off('admin:monitor:stats', onStats);
      socket.emit('admin:monitor:unsubscribe');
    };
  }, []);

  const runtimeSummary = useMemo(() => {
    if (latest == null) {
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
      };
    }
    const cpu = Math.max(0, Math.min(100, latest.process.cpuPercentOfSystem));
    const memory = hostMemUsedPercent(latest);
    const disk = hostDiskUsedPercent(latest);
    return { cpu, memory, disk };
  }, [latest]);

  const hostLabel = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'localhost';
    }
    return window.location.hostname === '' ? 'localhost' : window.location.hostname;
  }, []);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Dashboard</Title>
          <Badge variant="light" color="green">
            Live
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Sampling every 1s &bull; trend points every {COLLECTION_INTERVAL_S}s
        </Text>
      </Group>

      <HostAndUsageSection latest={latest} hostLabel={hostLabel} runtimeSummary={runtimeSummary} />
      <TrendsAndRuntimeSection latest={latest} history={history} />
    </Stack>
  );
});

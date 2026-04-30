import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { AdminSystemMetricsSnapshot } from '../../../shared/types/adminSystemMetrics.js';
import { api } from '../../utils/api.js';
import { HostAndUsageSection } from './monitor/HostAndUsageSection.js';
import { TrendsAndRuntimeSection } from './monitor/TrendsAndRuntimeSection.js';
import type { MonitorPoint } from './monitor/types.js';
import { POLL_MS, TREND_POINT_MS, appendTrendPoint, hostDiskUsedPercent, hostMemUsedPercent } from './monitor/utils.js';

export const AdminMonitorPanel = memo(function AdminMonitorPanel() {
  const [latest, setLatest] = useState<AdminSystemMetricsSnapshot | null>(null);
  const [history, setHistory] = useState<MonitorPoint[]>([]);
  const lastErrorNotifyAtRef = useRef(0);
  const isPageVisibleRef = useRef(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );

  const poll = useCallback(async () => {
    try {
      const m = await api.getAdminSystemMetrics();
      setLatest(m);
      setHistory((prev) =>
        appendTrendPoint(prev, {
          isoTime: m.timestamp,
          ts: Date.parse(m.timestamp),
          cpuPercent: m.process.cpuPercentOfSystem,
          memoryUsedPercent: hostMemUsedPercent(m),
          diskUsedPercent: hostDiskUsedPercent(m),
          hostMemUsedPercent: hostMemUsedPercent(m),
        }),
      );
    } catch (e: unknown) {
      const now = Date.now();
      if (now - lastErrorNotifyAtRef.current > 30_000) {
        lastErrorNotifyAtRef.current = now;
        notifications.show({
          title: 'Metrics unavailable',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      }
    }
  }, []);

  useEffect(() => {
    const runPoll = (): void => {
      if (!isPageVisibleRef.current) {
        return;
      }
      void poll();
    };
    runPoll();
    const intervalId = window.setInterval(runPoll, POLL_MS);
    const onVisibilityChange = (): void => {
      isPageVisibleRef.current = document.visibilityState === 'visible';
      if (isPageVisibleRef.current) {
        runPoll();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [poll]);

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
          Metrics every {POLL_MS / 1000}s • trend points every {TREND_POINT_MS / 1000}s
        </Text>
      </Group>

      <HostAndUsageSection latest={latest} hostLabel={hostLabel} runtimeSummary={runtimeSummary} />
      <TrendsAndRuntimeSection latest={latest} history={history} />
    </Stack>
  );
});

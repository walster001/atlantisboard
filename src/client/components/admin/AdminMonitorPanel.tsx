import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Stack, Text, Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { notifications } from '@mantine/notifications';
import type { AdminSystemMetricsSnapshot } from '../../../shared/types/adminSystemMetrics.js';
import { api } from '../../utils/api.js';

const POLL_MS = 5000;
const WINDOW_MS = 5 * 60 * 1000;
const HISTORY_CAP = Math.ceil(WINDOW_MS / POLL_MS);

interface MonitorPoint {
  readonly t: string;
  readonly cpuPercent: number;
  readonly rssMb: number;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}:${ss}`;
}

function pushPoint(prev: readonly MonitorPoint[], next: MonitorPoint): MonitorPoint[] {
  const merged = [...prev, next];
  return merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged;
}

export const AdminMonitorPanel = memo(function AdminMonitorPanel() {
  const [latest, setLatest] = useState<AdminSystemMetricsSnapshot | null>(null);
  const [history, setHistory] = useState<MonitorPoint[]>([]);

  const poll = useCallback(async () => {
    try {
      const m = await api.getAdminSystemMetrics();
      setLatest(m);
      setHistory((prev) =>
        pushPoint(prev, {
          t: formatShortTime(m.timestamp),
          cpuPercent: m.process.cpuPercentOfSystem,
          rssMb: m.process.rssMb,
        }),
      );
    } catch (e: unknown) {
      notifications.show({
        title: 'Metrics unavailable',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  const versionLines = useMemo(() => {
    if (latest == null) return null;
    const v = latest.versions;
    return (
      <Stack gap={4}>
        <Text size="sm">
          App <Text span fw={600}>{v.app}</Text>
        </Text>
        <Text size="sm">
          Node <Text span ff="monospace">{v.node}</Text>
          {v.bun != null && v.bun !== '' ? (
            <>
              {' '}
              · Bun <Text span ff="monospace">{v.bun}</Text>
            </>
          ) : null}
        </Text>
        <Text size="sm">
          MongoDB{' '}
          <Text span ff="monospace">
            {v.mongodb ?? '—'}
          </Text>
        </Text>
        <Text size="sm">
          MinIO{' '}
          <Text span ff="monospace">
            {v.minio ?? '—'}
          </Text>
        </Text>
      </Stack>
    );
  }, [latest]);

  return (
    <Stack gap="md">
      <Title order={3}>Monitor</Title>
      <Text size="sm" c="dimmed">
        CPU and RAM line charts show the last 5 minutes (sampled every {POLL_MS / 1000}s) while
        this tab is open.
      </Text>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Versions
            </Text>
            <Box mt="xs">{versionLines}</Box>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                CPU usage (% of all cores)
              </Text>
              <Text size="xl" fw={700} mb="xs">
                {latest != null ? latest.process.cpuPercentOfSystem.toFixed(1) : '—'}%
              </Text>
              <Box h={180}>
                <LineChart
                  h={180}
                  data={history}
                  dataKey="t"
                  withDots={false}
                  withLegend={false}
                  curveType="natural"
                  yAxisProps={{ domain: [0, 'dataMax + 5'] }}
                  valueFormatter={(v) => `${v.toFixed(1)}%`}
                  series={[{ name: 'cpuPercent', label: 'CPU %', color: 'blue' }]}
                />
              </Box>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Process RAM usage (RSS MB)
              </Text>
              <Text size="xl" fw={700} mb="xs">
                {latest != null ? latest.process.rssMb.toFixed(0) : '—'} MB
              </Text>
              <Text size="sm" c="dimmed" mb="xs">
                Heap {latest != null ? latest.process.heapUsedMb.toFixed(0) : '—'} /{' '}
                {latest != null ? latest.process.heapTotalMb.toFixed(0) : '—'} MB
              </Text>
              <Box h={180}>
                <LineChart
                  h={180}
                  data={history}
                  dataKey="t"
                  withDots={false}
                  withLegend={false}
                  curveType="natural"
                  valueFormatter={(v) => `${v.toFixed(0)} MB`}
                  series={[{ name: 'rssMb', label: 'RSS MB', color: 'teal' }]}
                />
              </Box>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="sm" c="dimmed">
                {latest?.system != null && typeof latest.system.memAvailableMb === 'number'
                  ? `Host available memory: ${latest.system.memAvailableMb.toFixed(0)} MB` +
                    (typeof latest.system.memTotalMb === 'number'
                      ? ` / ${latest.system.memTotalMb.toFixed(0)} MB`
                      : '') +
                    ` · load ${latest.system.load1m.toFixed(2)} / ${latest.system.load5m.toFixed(2)}`
                  : 'Host memory gauges need Linux /proc/meminfo.'}
              </Text>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
});

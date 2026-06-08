import { useMemo } from 'react';
import { Box, Grid, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { IconHelpCircle } from '@tabler/icons-react';
import type { TooltipProps } from 'recharts';
import type { AdminSystemMetricsSnapshot } from '../../../../shared/types/adminSystemMetrics.js';
import type { MonitorPoint } from './types.js';
import {
  CPU_TREND_Y_TICKS,
  buildEvenAxisTicks,
  capacityGbFromMb,
  formatBytesPerSecond,
  formatCapacityAxisTick,
  formatDiskUsedTotalLabelGb,
  formatGbOneDecimal,
  formatMemoryUsedTotalLabel,
  formatTrendAxisTime,
  formatUptimeCompact,
} from './utils.js';

const DISK_CHART_MARGIN = { top: 4, right: 12, bottom: 0, left: 64 };

const DISK_Y_AXIS_PROPS = {
  width: 58,
  tickFormatter: (value: number) => formatCapacityAxisTick(value),
} as const;

const TREND_X_AXIS_PROPS = {
  type: 'number' as const,
  domain: ['dataMin', 'dataMax'] as ['dataMin', 'dataMax'],
  tickFormatter: (value: number) => formatTrendAxisTime(value),
};

function UsedTotalTrendTooltip({
  active,
  payload,
  formatValue,
}: {
  readonly active: boolean | undefined;
  readonly payload: TooltipProps<number, string>['payload'] | undefined;
  readonly formatValue: (row: MonitorPoint) => string;
}) {
  if (active !== true || payload == null || payload.length === 0) {
    return null;
  }
  const row = payload[0]?.payload as MonitorPoint | undefined;
  if (row == null) {
    return null;
  }
  return (
    <Paper withBorder p="xs" radius="sm" shadow="sm">
      <Text size="xs" c="dimmed">
        {formatTrendAxisTime(row.ts)}
      </Text>
      <Text size="sm" fw={600}>
        {formatValue(row)}
      </Text>
    </Paper>
  );
}

export function TrendsAndRuntimeSection(props: {
  latest: AdminSystemMetricsSnapshot | null;
  history: readonly MonitorPoint[];
}) {
  const { latest, history } = props;
  const chartData = useMemo(() => [...history], [history]);

  const memoryCapacityGb = useMemo(() => {
    const fromLatest = latest?.system?.memTotalMb ?? 0;
    const fromHistory = chartData.reduce((max, point) => Math.max(max, point.hostMemTotalMb), 0);
    return capacityGbFromMb(Math.max(fromLatest, fromHistory, 1));
  }, [chartData, latest]);

  const diskCapacityGb = useMemo(() => {
    const fromLatest = latest?.system?.diskTotalMb ?? 0;
    const fromHistory = chartData.reduce((max, point) => Math.max(max, point.diskTotalMb), 0);
    return capacityGbFromMb(Math.max(fromLatest, fromHistory, 1));
  }, [chartData, latest]);

  const memoryYTicks = useMemo(
    () => buildEvenAxisTicks(memoryCapacityGb),
    [memoryCapacityGb],
  );

  const diskYTicks = useMemo(() => buildEvenAxisTicks(diskCapacityGb), [diskCapacityGb]);

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">CPU Trend</Text>
            <Box h={140} style={{ overflow: 'hidden' }}>
              <LineChart
                h={140}
                data={chartData}
                dataKey="ts"
                withDots
                dotProps={{ r: 2.5, strokeWidth: 1 }}
                activeDotProps={{ r: 5, strokeWidth: 2 }}
                withLegend={false}
                curveType="monotone"
                xAxisProps={TREND_X_AXIS_PROPS}
                yAxisProps={{
                  domain: [0, 100],
                  ticks: [...CPU_TREND_Y_TICKS],
                  allowDecimals: false,
                }}
                valueFormatter={(v) => `${Math.round(v)}%`}
                tooltipProps={{
                  content: ({ active, payload }) => (
                    <UsedTotalTrendTooltip
                      active={active}
                      payload={payload}
                      formatValue={(row) => `${Math.round(row.cpuPercent)}%`}
                    />
                  ),
                }}
                series={[{ name: 'cpuPercent', label: 'CPU %', color: 'orange' }]}
              />
            </Box>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">Memory Trend</Text>
            <Box h={140} style={{ overflow: 'hidden' }}>
              <LineChart
                h={140}
                data={chartData}
                dataKey="ts"
                withDots
                dotProps={{ r: 2.5, strokeWidth: 1 }}
                activeDotProps={{ r: 5, strokeWidth: 2 }}
                withLegend={false}
                curveType="monotone"
                xAxisProps={TREND_X_AXIS_PROPS}
                yAxisProps={{
                  domain: [0, memoryCapacityGb],
                  ticks: memoryYTicks,
                  allowDecimals: true,
                  tickFormatter: (value: number) => formatGbOneDecimal(value),
                }}
                valueFormatter={(v) => formatGbOneDecimal(v)}
                tooltipProps={{
                  content: ({ active, payload }) => (
                    <UsedTotalTrendTooltip
                      active={active}
                      payload={payload}
                      formatValue={(row) =>
                        formatMemoryUsedTotalLabel(row.hostMemUsedMb, row.hostMemTotalMb)
                      }
                    />
                  ),
                }}
                series={[{ name: 'hostMemUsedGb', label: 'Memory', color: 'blue' }]}
              />
            </Box>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">Disk Trend</Text>
            <Box h={140} style={{ overflow: 'hidden' }}>
              <LineChart
                h={140}
                data={chartData}
                dataKey="ts"
                unit="GB"
                withDots
                dotProps={{ r: 2.5, strokeWidth: 1 }}
                activeDotProps={{ r: 5, strokeWidth: 2 }}
                withLegend={false}
                curveType="monotone"
                lineChartProps={{ margin: DISK_CHART_MARGIN }}
                xAxisProps={TREND_X_AXIS_PROPS}
                yAxisProps={{
                  ...DISK_Y_AXIS_PROPS,
                  domain: [0, diskCapacityGb],
                  ticks: diskYTicks,
                  allowDecimals: false,
                }}
                valueFormatter={(v) => formatGbOneDecimal(v)}
                tooltipProps={{
                  content: ({ active, payload }) => (
                    <UsedTotalTrendTooltip
                      active={active}
                      payload={payload}
                      formatValue={(row) =>
                        formatDiskUsedTotalLabelGb(row.diskUsedMb, row.diskTotalMb)
                      }
                    />
                  ),
                }}
                series={[{ name: 'diskUsedGb', label: 'Disk', color: 'teal' }]}
              />
            </Box>
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
        <Grid gutter={0}>
          <MetricCell label="Uptime Window" value={formatUptimeCompact(latest?.runtime.uptimeSec)} />
          <MetricCell
            label="Databases"
            value={
              latest?.runtime.databaseSizeMb != null
                ? latest.runtime.databaseSizeMb > 1000
                  ? `${Math.round(latest.runtime.databaseSizeMb / 1024)} GB`
                  : `${Math.round(latest.runtime.databaseSizeMb)} MB`
                : 'N/A'
            }
          />
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Box p="sm">
              <Text size="xs" c="dimmed">Docker</Text>
              <Group gap={6} align="center">
                <Text fw={600}>
                  {latest?.runtime.dockerRunning != null && latest.runtime.dockerTotal != null
                    ? `${latest.runtime.dockerRunning}/${latest.runtime.dockerTotal} running`
                    : 'N/A'}
                </Text>
                {Array.isArray(latest?.runtime.dockerRunningContainers) &&
                  latest.runtime.dockerRunningContainers.length > 0 && (
                    <Tooltip
                      label={
                        <Stack gap={2}>
                          <Text size="xs" fw={600}>Running containers</Text>
                          {latest.runtime.dockerRunningContainers.map((name) => (
                            <Text key={name} size="xs">{name}</Text>
                          ))}
                        </Stack>
                      }
                      multiline
                      withArrow
                    >
                      <Box component="span" style={{ display: 'inline-flex', cursor: 'help' }}>
                        <IconHelpCircle size={14} />
                      </Box>
                    </Tooltip>
                  )}
              </Group>
            </Box>
          </Grid.Col>
          <MetricCell label="Backups" value={latest?.runtime.backupCount != null ? `${latest.runtime.backupCount} total` : 'N/A'} />
          <MetricCell label="Disk Read" value={formatBytesPerSecond(latest?.system?.diskReadBytesPerSec)} />
          <MetricCell label="Disk Write" value={formatBytesPerSecond(latest?.system?.diskWriteBytesPerSec)} />
          <MetricCell label="Bandwidth Up" value={formatBytesPerSecond(latest?.system?.networkTxBytesPerSec)} />
          <MetricCell label="Bandwidth Down" value={formatBytesPerSecond(latest?.system?.networkRxBytesPerSec)} />
        </Grid>
      </Paper>
    </>
  );
}

function MetricCell(props: { label: string; value: string }) {
  return (
    <Grid.Col span={{ base: 12, md: 3 }}>
      <Box p="sm">
        <Text size="xs" c="dimmed">{props.label}</Text>
        <Text fw={600}>{props.value}</Text>
      </Box>
    </Grid.Col>
  );
}

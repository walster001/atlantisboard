import { Box, Grid, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { IconHelpCircle } from '@tabler/icons-react';
import type { AdminSystemMetricsSnapshot } from '../../../../shared/types/adminSystemMetrics.js';
import type { MonitorPoint } from './types.js';
import { formatBytesPerSecond, formatUptimeCompact } from './utils.js';

export function TrendsAndRuntimeSection(props: {
  latest: AdminSystemMetricsSnapshot | null;
  history: readonly MonitorPoint[];
}) {
  const { latest, history } = props;
  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">CPU Trend</Text>
            <Box h={140}>
              <LineChart
                h={140}
                data={[...history]}
                dataKey="t"
                withDots={false}
                withLegend={false}
                curveType="natural"
                yAxisProps={{ domain: [0, 'dataMax + 5'] }}
                valueFormatter={(v) => `${v.toFixed(1)}%`}
                series={[{ name: 'cpuPercent', label: 'CPU %', color: 'orange' }]}
              />
            </Box>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">Memory Trend</Text>
            <Box h={140}>
              <LineChart
                h={140}
                data={[...history]}
                dataKey="t"
                withDots={false}
                withLegend={false}
                curveType="natural"
                yAxisProps={{ domain: [0, 100] }}
                valueFormatter={(v) => `${v.toFixed(1)}%`}
                series={[{ name: 'hostMemUsedPercent', label: 'Mem %', color: 'blue' }]}
              />
            </Box>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed" mb="xs">Disk Trend</Text>
            <Box h={140}>
              <LineChart
                h={140}
                data={[...history]}
                dataKey="t"
                withDots={false}
                withLegend={false}
                curveType="natural"
                yAxisProps={{ domain: [0, 100] }}
                valueFormatter={(v) => `${v.toFixed(1)}%`}
                series={[{ name: 'diskUsedPercent', label: 'Disk %', color: 'teal' }]}
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

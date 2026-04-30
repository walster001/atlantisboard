import { Grid, Group, Paper, Progress, Text } from '@mantine/core';
import { IconCpu, IconDatabase, IconLayoutBottombar } from '@tabler/icons-react';
import type { AdminSystemMetricsSnapshot } from '../../../../shared/types/adminSystemMetrics.js';
import type { RuntimeSummary } from './types.js';
import { displayStorageFromMb, formatNumber } from './utils.js';

export function HostAndUsageSection(props: {
  latest: AdminSystemMetricsSnapshot | null;
  hostLabel: string;
  runtimeSummary: RuntimeSummary;
}) {
  const { latest, hostLabel, runtimeSummary } = props;
  return (
    <>
      <Paper withBorder radius="md" p="sm">
        <Grid gutter="xs">
          <Grid.Col span={{ base: 12, md: 2 }}>
            <Text size="xs" c="dimmed">Hostname</Text>
            <Text size="sm" fw={600}>{hostLabel}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 2.5 }}>
            <Text size="xs" c="dimmed">OS</Text>
            <Text size="sm">{latest?.host.os ?? 'N/A'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 1.5 }}>
            <Text size="xs" c="dimmed">Kernel</Text>
            <Text size="sm">{latest?.host.kernel ?? 'N/A'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Text size="xs" c="dimmed">Processor</Text>
            <Text size="sm">{latest?.host.processor ?? 'N/A'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 1.5 }}>
            <Text size="xs" c="dimmed">Temperature</Text>
            <Text size="sm">
              {latest?.host.temperatureC != null ? `${latest.host.temperatureC.toFixed(1)} C` : 'N/A'}
            </Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 1.5 }}>
            <Text size="xs" c="dimmed">Processes</Text>
            <Text size="sm">{latest?.host.processes != null ? formatNumber(latest.host.processes) : 'N/A'}</Text>
          </Grid.Col>
        </Grid>
      </Paper>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Group gap={6}><IconCpu size={20} /><Text size="xs" c="dimmed">CPU Usage</Text></Group>
            <Text size="36px" fw={700} lh={1.1}>{runtimeSummary.cpu.toFixed(0)}%</Text>
            <Progress mt="sm" value={runtimeSummary.cpu} color="orange" animated />
            <Text size="xs" mt="xs" c="dimmed">
              {latest != null
                ? `${latest.process.cpuCoresApprox.toFixed(2)} core(s) • load ${latest.system?.load1m.toFixed(2) ?? 'N/A'}`
                : 'Waiting for samples'}
            </Text>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Group gap={6}><IconDatabase size={20} /><Text size="xs" c="dimmed">Memory</Text></Group>
            <Text size="36px" fw={700} lh={1.1}>{runtimeSummary.memory.toFixed(0)}%</Text>
            <Progress mt="sm" value={runtimeSummary.memory} color="blue" animated />
            <Text size="xs" mt="xs" c="dimmed">
              {latest?.system != null
                ? `${displayStorageFromMb((latest.system.memTotalMb ?? 0) - (latest.system.memAvailableMb ?? 0))} used / ${displayStorageFromMb(latest.system.memTotalMb ?? 0)} total`
                : 'Host memory metrics unavailable'}
            </Text>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Group gap={6}><IconLayoutBottombar size={20} /><Text size="xs" c="dimmed">Disk</Text></Group>
            <Text size="36px" fw={700} lh={1.1}>{runtimeSummary.disk.toFixed(0)}%</Text>
            <Progress mt="sm" value={runtimeSummary.disk} color="teal" animated />
            <Text size="xs" mt="xs" c="dimmed">
              {latest?.system != null
                ? `${displayStorageFromMb(latest.system.diskUsedMb ?? 0)} used / ${displayStorageFromMb(latest.system.diskTotalMb ?? 0)} total`
                : 'Disk metrics unavailable'}
            </Text>
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}

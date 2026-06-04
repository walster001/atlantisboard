import { memo, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconDatabase, IconRefresh, IconTrash } from '@tabler/icons-react';
import type { DatabaseCleanupCategoryId } from '../../../shared/types/adminDatabaseMaintenance.js';
import { useAdminDatabasePanelState } from './AdminDatabasePanel/useAdminDatabasePanelState.js';

function formatMb(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)} MB`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

export const AdminDatabasePanel = memo(function AdminDatabasePanel() {
  const {
    snapshot,
    loading,
    refreshing,
    cleaningCategoryId,
    cleaningAllSafe,
    refresh,
    cleanupCategory,
    cleanupAllSafe,
  } = useAdminDatabasePanelState();

  const [confirmCategory, setConfirmCategory] = useState<DatabaseCleanupCategoryId | null>(null);
  const [confirmAllSafeOpen, setConfirmAllSafeOpen] = useState(false);

  const confirmCategoryMeta = useMemo(() => {
    if (confirmCategory == null || snapshot == null) {
      return null;
    }
    return snapshot.cleanupCategories.find((row) => row.id === confirmCategory) ?? null;
  }, [confirmCategory, snapshot]);

  const safeRemovableTotal = useMemo(() => {
    if (snapshot == null) {
      return 0;
    }
    return snapshot.cleanupCategories
      .filter((row) => row.safeToDelete)
      .reduce((sum, row) => sum + row.count, 0);
  }, [snapshot]);

  const unknownCollections = useMemo(
    () => snapshot?.collections.filter((row) => !row.knownToApp) ?? [],
    [snapshot],
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={4}>
          <Title order={3}>Database</Title>
          <Text size="sm" c="dimmed">
            MongoDB usage, collection counts, and manual cleanup for stale or orphaned documents not
            referenced by the application.
          </Text>
        </Stack>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconRefresh size={18} />}
            loading={refreshing}
            onClick={() => void refresh({ silent: true })}
          >
            Refresh
          </Button>
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={18} />}
            loading={cleaningAllSafe}
            disabled={safeRemovableTotal === 0}
            onClick={() => setConfirmAllSafeOpen(true)}
          >
            Clean all safe ({formatCount(safeRemovableTotal)})
          </Button>
        </Group>
      </Group>

      {loading ? (
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading database stats…
          </Text>
        </Group>
      ) : snapshot == null ? (
        <Text size="sm" c="dimmed">
          Stats could not be loaded. Use Refresh to try again.
        </Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <Stack gap={2} className="admin-database-panel__stat">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Database
              </Text>
              <Text fw={600}>{snapshot.databaseName || '—'}</Text>
              <Text size="xs" c="dimmed">
                MongoDB {snapshot.mongoVersion ?? 'unknown'}
              </Text>
            </Stack>
            <Stack gap={2} className="admin-database-panel__stat">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Storage
              </Text>
              <Text fw={600}>{formatMb(snapshot.storageSizeMb ?? snapshot.dataSizeMb)}</Text>
              <Text size="xs" c="dimmed">
                Data {formatMb(snapshot.dataSizeMb)}
              </Text>
            </Stack>
            <Stack gap={2} className="admin-database-panel__stat">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Documents
              </Text>
              <Text fw={600}>{formatCount(snapshot.totalDocuments)}</Text>
              <Text size="xs" c="dimmed">
                {formatCount(snapshot.collections.length)} collections
              </Text>
            </Stack>
            <Stack gap={2} className="admin-database-panel__stat">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Removable (safe)
              </Text>
              <Text fw={600}>{formatCount(safeRemovableTotal)}</Text>
              <Text size="xs" c="dimmed">
                As of {new Date(snapshot.generatedAt).toLocaleString()}
              </Text>
            </Stack>
          </SimpleGrid>

          {unknownCollections.length > 0 ? (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Unknown collections
              </Text>
              <Text size="sm" c="dimmed">
                These collection names are not part of the application schema. Review before deleting
                data outside this panel.
              </Text>
              <Group gap="xs">
                {unknownCollections.map((row) => (
                  <Badge key={row.name} variant="outline" color="orange">
                    {row.name} ({formatCount(row.documentCount)})
                  </Badge>
                ))}
              </Group>
            </Stack>
          ) : null}

          <Stack gap="xs">
            <Group gap="xs">
              <IconDatabase size={20} stroke={1.5} />
              <Text fw={600}>Collections</Text>
            </Group>
            <Table striped highlightOnHover withTableBorder layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Collection</Table.Th>
                  <Table.Th>Documents</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {snapshot.collections.map((row) => (
                  <Table.Tr key={row.name}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {row.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{formatCount(row.documentCount)}</Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={row.knownToApp ? 'green' : 'orange'}
                      >
                        {row.knownToApp ? 'Known' : 'Unknown'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>

          <Stack gap="xs">
            <Text fw={600}>Manual cleanup</Text>
            <Text size="sm" c="dimmed">
              Orphaned rows reference deleted boards, lists, cards, or users. Stale jobs match the
              same retention as nightly cron tasks. Destructive categories require explicit
              confirmation.
            </Text>
            <Table striped highlightOnHover withTableBorder layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th w={100}>Count</Table.Th>
                  <Table.Th w={120}>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {snapshot.cleanupCategories.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>
                            {row.label}
                          </Text>
                          {row.safeToDelete ? (
                            <Badge size="xs" variant="light" color="teal">
                              Safe
                            </Badge>
                          ) : (
                            <Badge size="xs" variant="light" color="orange">
                              Review
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {row.description}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={600}>{formatCount(row.count)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={row.count === 0}
                        loading={cleaningCategoryId === row.id}
                        onClick={() => setConfirmCategory(row.id)}
                      >
                        Clean
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </>
      )}

      <Modal
        opened={confirmCategory != null}
        onClose={() => setConfirmCategory(null)}
        title="Confirm cleanup"
        centered
      >
        {confirmCategoryMeta != null ? (
          <Stack gap="md">
            <Text size="sm">
              Delete up to <strong>{formatCount(confirmCategoryMeta.count)}</strong> document
              {confirmCategoryMeta.count === 1 ? '' : 's'} in &ldquo;{confirmCategoryMeta.label}
              &rdquo;? This cannot be undone.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmCategory(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                loading={cleaningCategoryId === confirmCategoryMeta.id}
                onClick={() => {
                  const id = confirmCategoryMeta.id;
                  setConfirmCategory(null);
                  void cleanupCategory(id);
                }}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={confirmAllSafeOpen}
        onClose={() => setConfirmAllSafeOpen(false)}
        title="Clean all safe categories"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Run cleanup for every <strong>safe</strong> category that currently has removable rows (
            {formatCount(safeRemovableTotal)} total)? Categories marked Review are skipped.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAllSafeOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={cleaningAllSafe}
              onClick={() => {
                setConfirmAllSafeOpen(false);
                void cleanupAllSafe();
              }}
            >
              Clean all safe
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});

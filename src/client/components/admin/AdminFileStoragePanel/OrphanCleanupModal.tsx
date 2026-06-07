import { Button, Group, Modal, Progress, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { AdminFileStorageOrphanEntry } from '../../../../shared/types/adminFileStorage.js';
import { formatFileSize } from './helpers.js';
import { useOrphanCleanupModalState } from './useOrphanCleanupModalState.js';

type OrphanCleanupModalProps = {
  readonly opened: boolean;
  readonly onClose: () => void;
};

function orphanRowKey(entry: AdminFileStorageOrphanEntry): string {
  return `${entry.bucket}:${entry.key}`;
}

export function OrphanCleanupModal({ opened, onClose }: OrphanCleanupModalProps) {
  const {
    phase,
    progress,
    orphans,
    scanMeta,
    errorMessage,
    deletingKey,
    cleaningAll,
    runScan,
    deleteOrphan,
    deleteAllOrphans,
  } = useOrphanCleanupModalState(opened);

  const scanning = phase === 'references' || phase === 'scanning';
  const scanComplete = phase === 'complete';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Cleanup orphaned files"
      centered
      size="xl"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Scans application MinIO buckets for objects not referenced by cards, branding, fonts,
          avatars, board backgrounds, or import-inline assets. Folder markers are ignored.
        </Text>

        {scanning ? (
          <Stack gap={4}>
            <Text size="sm">Scanning storage…</Text>
            <Progress value={progress} animated />
          </Stack>
        ) : null}

        {phase === 'error' ? (
          <Stack gap="sm">
            <Text size="sm" c="red">
              {errorMessage ?? 'Could not scan for orphaned files.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void runScan()}>Retry scan</Button>
            </Group>
          </Stack>
        ) : null}

        {scanComplete ? (
          <>
            <Text size="sm" c="dimmed">
              Scanned {scanMeta?.scannedBuckets ?? 0} bucket
              {(scanMeta?.scannedBuckets ?? 0) === 1 ? '' : 's'},{' '}
              {scanMeta?.scannedObjects ?? 0} object
              {(scanMeta?.scannedObjects ?? 0) === 1 ? '' : 's'},{' '}
              {scanMeta?.referencedObjects ?? 0} in use
              {scanMeta?.durationMs != null ? ` (${scanMeta.durationMs} ms)` : ''}.
            </Text>

            {orphans.length === 0 ? (
              <Text size="sm">No orphaned files found.</Text>
            ) : (
              <ScrollArea.Autosize mah={360} type="auto" offsetScrollbars>
                <Table striped highlightOnHover withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Bucket</Table.Th>
                      <Table.Th>Path</Table.Th>
                      <Table.Th>Size</Table.Th>
                      <Table.Th w={96} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {orphans.map((entry) => {
                      const rowKey = orphanRowKey(entry);
                      return (
                        <Table.Tr key={rowKey}>
                          <Table.Td>{entry.bucket}</Table.Td>
                          <Table.Td>
                            <Text size="sm" ff="monospace">
                              {entry.key}
                            </Text>
                          </Table.Td>
                          <Table.Td>{formatFileSize(entry.size)}</Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              loading={deletingKey === `${entry.bucket}\0${entry.key}`}
                              onClick={() => void deleteOrphan(entry)}
                            >
                              Delete
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}

            <Group justify="space-between">
              <Button variant="default" onClick={() => void runScan()} disabled={cleaningAll}>
                Rescan
              </Button>
              <Group gap="xs">
                <Button variant="default" onClick={onClose}>
                  Close
                </Button>
                {orphans.length > 0 ? (
                  <Button
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    loading={cleaningAll}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete all ${orphans.length} orphaned file${orphans.length === 1 ? '' : 's'}? This cannot be undone.`,
                        )
                      ) {
                        void deleteAllOrphans();
                      }
                    }}
                  >
                    Clean all
                  </Button>
                ) : null}
              </Group>
            </Group>
          </>
        ) : null}
      </Stack>
    </Modal>
  );
}

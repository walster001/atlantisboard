import {
  ActionIcon,
  Group,
  Loader,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconDownload, IconFolder, IconTrash } from '@tabler/icons-react';
import type { AdminFileStorageObjectEntry } from '../../../../shared/types/adminFileStorage.js';
import { FileStorageObjectName } from './FileStorageObjectName.js';
import { formatFileSize, formatModifiedAt } from './helpers.js';

type FileStorageObjectTableProps = {
  readonly entries: readonly AdminFileStorageObjectEntry[];
  readonly loading: boolean;
  readonly selectedKey: string | null;
  readonly deletingKey: string | null;
  readonly downloadingKey: string | null;
  readonly onOpenFolder: (key: string) => void;
  readonly onSelectFile: (entry: AdminFileStorageObjectEntry) => void;
  readonly onDownload: (key: string) => void;
  readonly onDelete: (entry: AdminFileStorageObjectEntry) => void;
};

export function FileStorageObjectTable({
  entries,
  loading,
  selectedKey,
  deletingKey,
  downloadingKey,
  onOpenFolder,
  onSelectFile,
  onDownload,
  onDelete,
}: FileStorageObjectTableProps) {
  if (loading) {
    return (
      <Group py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading objects…
        </Text>
      </Group>
    );
  }

  if (entries.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="md">
        This folder is empty. Upload a file or create a folder to get started.
      </Text>
    );
  }

  return (
    <Table striped highlightOnHover withTableBorder layout="fixed">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th w={88}>Size</Table.Th>
          <Table.Th w={120}>Modified</Table.Th>
          <Table.Th w={88}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry) => {
          const isSelected = !entry.isFolder && selectedKey === entry.key;
          return (
          <Table.Tr
            key={entry.key}
            {...(isSelected ? { 'data-selected': 'true' as const } : {})}
            className={isSelected ? 'admin-file-storage-panel__row--selected' : ''}
            onClick={() => {
              if (!entry.isFolder) {
                onSelectFile(entry);
              }
            }}
            {...(!entry.isFolder ? { style: { cursor: 'pointer' as const } } : {})}
          >
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                {entry.isFolder ? <IconFolder size={18} stroke={1.5} /> : null}
                {entry.isFolder ? (
                  <Text
                    component="button"
                    type="button"
                    size="sm"
                    ff="monospace"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenFolder(entry.key);
                    }}
                  >
                    {entry.name}
                  </Text>
                ) : (
                  <FileStorageObjectName entry={entry} />
                )}
              </Group>
            </Table.Td>
            <Table.Td>{entry.isFolder ? '—' : formatFileSize(entry.size)}</Table.Td>
            <Table.Td>
              <Text size="xs" lineClamp={1}>
                {formatModifiedAt(entry.lastModified)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Group gap={4} wrap="nowrap" onClick={(event) => event.stopPropagation()}>
                {!entry.isFolder ? (
                  <Tooltip label="Download">
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Download ${entry.name}`}
                      loading={downloadingKey === entry.key}
                      onClick={() => void onDownload(entry.key)}
                    >
                      <IconDownload size={18} />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
                <Tooltip label="Delete">
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Delete ${entry.name}`}
                    loading={deletingKey === entry.key}
                    onClick={() => onDelete(entry)}
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Table.Td>
          </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

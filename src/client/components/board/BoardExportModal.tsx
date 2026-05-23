import { useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  BOARD_EXPORT_FORMAT_LABELS,
  BOARD_EXPORT_FORMATS,
  type BoardExportFormat,
} from '../../../shared/export/boardExportFormats.js';
import { api } from '../../utils/api.js';

interface BoardExportModalProps {
  readonly boardId: string;
  readonly boardName: string;
  readonly opened: boolean;
  readonly onClose: () => void;
}

const FORMAT_OPTIONS = BOARD_EXPORT_FORMATS.map((value) => ({
  value,
  label: BOARD_EXPORT_FORMAT_LABELS[value],
}));

export function BoardExportModal({ boardId, boardName, opened, onClose }: BoardExportModalProps) {
  const [format, setFormat] = useState<BoardExportFormat>('atlantisboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const filename = await api.exportBoard(boardId, format);
      notifications.show({
        title: 'Export complete',
        message: `${filename} downloaded.`,
        color: 'green',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Export board" centered>
      <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Export <strong>{boardName.trim() || 'this board'}</strong> to a file on your device.
            Attachments are embedded when small enough to keep the export portable.
          </Text>
          <Select
            label="Format"
            data={FORMAT_OPTIONS}
            value={format}
            onChange={(value) => {
              if (value != null && (BOARD_EXPORT_FORMATS as readonly string[]).includes(value)) {
                setFormat(value as BoardExportFormat);
              }
            }}
            allowDeselect={false}
            disabled={loading}
          />
          {error != null ? <Alert color="red">{error}</Alert> : null}
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button loading={loading} onClick={() => void handleExport()}>
              Export
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Group, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  hasBoardExportFormatPermission,
} from '../../../shared/export/boardExportPermissions.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
import { PANEL_FOOTER_STYLE, PANEL_SCROLL_AREA_STYLE } from '../../utils/importJobUtils.js';

interface ExportTabProps {
  readonly boardId: string;
  readonly onClose: () => void;
}

export function ExportTab({ boardId, onClose }: ExportTabProps) {
  const [exportColumns, setExportColumns] = useState<string[]>([
    'title',
    'description',
    'list',
    'labels',
    'assignees',
    'dueDate',
  ]);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { permissions: boardPermissions, loaded: boardPermissionsLoaded } = useBoardPermissions(boardId);
  const canExportAtlantisboardJson = hasBoardExportFormatPermission(boardPermissions, 'atlantisboard');
  const canExportCsv = hasBoardExportFormatPermission(boardPermissions, 'csv');

  const effectiveExportFormat = useMemo((): 'json' | 'csv' => {
    if (!boardPermissionsLoaded) {
      return exportFormat;
    }
    if (exportFormat === 'json' && !canExportAtlantisboardJson && canExportCsv) {
      return 'csv';
    }
    if (exportFormat === 'csv' && !canExportCsv && canExportAtlantisboardJson) {
      return 'json';
    }
    return exportFormat;
  }, [boardPermissionsLoaded, exportFormat, canExportAtlantisboardJson, canExportCsv]);

  const handleExport = useCallback(async () => {
    setError(null);

    if (effectiveExportFormat === 'json' && !canExportAtlantisboardJson) {
      setError('You do not have permission to export this board as JSON.');
      return;
    }
    if (effectiveExportFormat === 'csv' && !canExportCsv) {
      setError('You do not have permission to export this board as CSV.');
      return;
    }

    setLoading(true);

    try {
      if (effectiveExportFormat === 'json') {
        await api.exportBoardAsJSON(boardId);
      } else {
        await api.exportBoardAsCSV(boardId, exportColumns);
      }
      setLoading(false);
      notifications.show({
        color: 'blue',
        title: 'Export started',
        message: 'Your file will download shortly.',
      });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Export failed');
      }
      setLoading(false);
    }
  }, [boardId, canExportAtlantisboardJson, canExportCsv, effectiveExportFormat, exportColumns, onClose]);

  if (!boardPermissionsLoaded) {
    return null;
  }

  return (
    <>
      {error ? (
        <Text c="red" size="sm" mb="md">
          {error}
        </Text>
      ) : null}
      <Stack gap="md" style={{ minHeight: 0, flex: 1 }}>
        <Box style={PANEL_SCROLL_AREA_STYLE}>
          <Select
            label="Export Format"
            value={effectiveExportFormat}
            onChange={(value) => setExportFormat((value || 'json') as 'json' | 'csv')}
            data={[
              ...(canExportAtlantisboardJson
                ? [{ value: 'json', label: 'JSON (Complete board data)' }]
                : []),
              ...(canExportCsv
                ? [{ value: 'csv', label: 'CSV (Cards only, configurable columns)' }]
                : []),
            ]}
            disabled={loading}
            radius="md"
          />

          {effectiveExportFormat === 'csv' ? (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Select Columns to Export
              </Text>
              {[
                'title',
                'description',
                'list',
                'labels',
                'assignees',
                'dueDate',
                'startDate',
                'completed',
                'createdAt',
                'updatedAt',
              ].map((col) => (
                <Checkbox
                  key={col}
                  label={col.charAt(0).toUpperCase() + col.slice(1)}
                  checked={exportColumns.includes(col)}
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      setExportColumns([...exportColumns, col]);
                    } else {
                      setExportColumns(exportColumns.filter((c) => c !== col));
                    }
                  }}
                  disabled={loading}
                />
              ))}
            </Stack>
          ) : null}
        </Box>
        <Group justify="flex-end" gap="sm" style={PANEL_FOOTER_STYLE}>
          <Button variant="default" radius="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            color="blue"
            radius="md"
            onClick={() => void handleExport()}
            disabled={loading || (effectiveExportFormat === 'csv' && exportColumns.length === 0)}
            loading={loading}
          >
            Export
          </Button>
        </Group>
      </Stack>
    </>
  );
}

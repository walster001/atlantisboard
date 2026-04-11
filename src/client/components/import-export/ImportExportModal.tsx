import { useState, useRef, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Button,
  Alert,
  Stack,
  Select,
  FileInput,
  Checkbox,
  Group,
  Text,
  Loader,
  ThemeIcon,
  Box,
  Paper,
} from '@mantine/core';
import { IconUpload, IconFileText, IconPalette } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';

interface ImportExportModalProps {
  boardId?: string;
  workspaceId?: string;
  onClose: () => void;
}

type ImportType = 'trello' | 'wekan' | 'csv' | null;
type TabType = 'import' | 'export';

function ImportMappingCallout({ importType }: { importType: ImportType }) {
  if (!importType) {
    return null;
  }

  const lines: { text: string; emphasis?: boolean }[] =
    importType === 'wekan'
      ? [
          { text: 'Wekan Boards → KanBoard Boards' },
          { text: 'Wekan Lists → KanBoard Columns' },
          { text: 'Wekan Cards → KanBoard Cards' },
          { text: 'Wekan Labels → KanBoard Labels' },
          { text: 'Wekan Checklists → KanBoard Subtasks' },
          { text: 'Members, attachments, comments are ignored', emphasis: true },
        ]
      : importType === 'trello'
        ? [
            { text: 'Trello Boards → KanBoard Workspaces / Boards' },
            { text: 'Trello Lists → KanBoard Columns' },
            { text: 'Trello Cards → KanBoard Cards' },
            { text: 'Trello Labels → KanBoard Labels' },
            { text: 'Trello Checklists → KanBoard Subtasks' },
            { text: 'Members, attachments, comments are ignored', emphasis: true },
          ]
        : [
            { text: 'CSV / TSV rows → KanBoard Cards (this board)' },
            { text: 'Columns are mapped during import configuration' },
            { text: 'Attachments and rich metadata are not imported', emphasis: true },
          ];

  return (
    <Paper p="md" radius="md" bg="gray.0" withBorder>
      <Text fw={700} size="sm" mb="sm">
        Import Mapping:
      </Text>
      <Box component="ul" style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {lines.map((line) => (
          <Box
            component="li"
            key={line.text}
            mb={4}
            style={{ listStyleType: 'disc' }}
          >
            <Text
              component="span"
              size="sm"
              c={line.emphasis ? 'orange.7' : 'dark.7'}
            >
              {line.text}
            </Text>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export function ImportExportModal({ boardId, workspaceId, onClose }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [importType, setImportType] = useState<ImportType>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const defaultUncolouredColor = 'none';
  const [exportColumns, setExportColumns] = useState<string[]>([
    'title',
    'description',
    'list',
    'labels',
    'assignees',
    'dueDate',
  ]);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleImport = async () => {
    if (!file || !importType) return;

    setLoading(true);
    setError(null);

    try {
      let result: { message: string; jobId: string };

      if (importType === 'trello') {
        result = await api.importTrello(file, workspaceId);
      } else if (importType === 'wekan') {
        result = await api.importWekan(file);
      } else if (importType === 'csv') {
        if (!boardId) {
          throw new Error('Board ID is required for CSV import');
        }
        result = await api.importCSV(file, boardId);
      } else {
        throw new Error('Invalid import type');
      }

      setJobId(result.jobId);
      pollJobStatus(result.jobId);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Import failed');
      }
      setLoading(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    intervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      try {
        const response = await api.getImportJobStatus(id);
        const job = (response as { job: { status: string; progress: number; result?: unknown; importErrors?: unknown[] } }).job;

        if (!isMountedRef.current) return;

        if (job.status === 'completed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          if (isMountedRef.current) {
            setLoading(false);
            notifications.show({
              color: 'green',
              title: 'Import complete',
              message: `Imported ${(job.result as { importedCount?: number })?.importedCount || 0} items.`,
            });
            onClose();
          }
        } else if (job.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          if (isMountedRef.current) {
            setLoading(false);
            const errors = job.importErrors || [];
            setError(`Import failed. ${errors.length > 0 ? `Errors: ${JSON.stringify(errors)}` : ''}`);
          }
        }
      } catch {
        if (!isMountedRef.current) return;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (isMountedRef.current) {
          setLoading(false);
          setError('Failed to check import status');
        }
      }
    }, 2000);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutRef.current = null;
      if (isMountedRef.current) {
        setLoading(false);
        setError('Import is taking longer than expected. Please check back later.');
      }
    }, 5 * 60 * 1000);
  };

  const handleExport = async () => {
    setError(null);

    if (!boardId) {
      setError('Board ID is required for export');
      return;
    }

    setLoading(true);

    try {
      if (exportFormat === 'json') {
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
  };

  const fileLabel =
    importType === 'wekan'
      ? 'Wekan Export File'
      : importType === 'trello'
        ? 'Trello Export File'
        : importType === 'csv'
          ? 'CSV / TSV File'
          : 'Export File';

  const importBlocked = !!jobId && loading;
  const cancelDisabled = loading && !jobId;

  const modalTitle =
    activeTab === 'import' ? (
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={44} variant="light" color="gray" radius="md">
          <IconUpload size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={4}>
          <Text fw={700} size="lg">
            Import Boards
          </Text>
          <Text size="sm" c="dimmed" maw={360}>
            Import boards from external kanban applications.
          </Text>
        </Stack>
      </Group>
    ) : (
      <Text fw={700} size="lg">
        Export
      </Text>
    );

  return (
    <Modal
      opened={true}
      onClose={jobId ? () => {} : onClose}
      title={modalTitle}
      centered
      size="lg"
      radius="md"
      padding="lg"
      overlayProps={{ backgroundOpacity: 0.45 }}
    >
      <Tabs value={activeTab} onChange={(value) => setActiveTab((value || 'import') as TabType)}>
        <Tabs.List mb="md">
          <Tabs.Tab value="import">Import</Tabs.Tab>
          {boardId ? <Tabs.Tab value="export">Export</Tabs.Tab> : null}
        </Tabs.List>

        {error ? (
          <Alert color="red" mb="md" radius="md">
            {error}
          </Alert>
        ) : null}

        <Tabs.Panel value="import">
          <Stack gap="lg">
            <Select
              label="Import Source"
              placeholder="Select import source…"
              value={importType ?? ''}
              onChange={(value) => {
                setImportType((value as ImportType) || null);
                setFile(null);
              }}
              data={[
                { value: 'wekan', label: 'Wekan JSON' },
                { value: 'trello', label: 'Trello JSON' },
                ...(boardId ? [{ value: 'csv', label: 'CSV / TSV' }] : []),
              ]}
              disabled={loading}
              leftSection={<IconFileText size={18} stroke={1.5} />}
              radius="md"
            />

            {importType ? (
              <>
                <FileInput
                  label={fileLabel}
                  accept={importType === 'csv' ? '.csv,.tsv' : '.json'}
                  placeholder="No file chosen"
                  onChange={(f) => {
                    setFile(f);
                    setError(null);
                  }}
                  disabled={loading}
                  radius="md"
                />

                <Select
                  label="Default Colour for Uncoloured Cards"
                  value={defaultUncolouredColor}
                  onChange={() => {}}
                  data={[{ value: 'none', label: 'No default colour' }]}
                  disabled={loading}
                  leftSection={<IconPalette size={18} stroke={1.5} />}
                  radius="md"
                  allowDeselect={false}
                />

                {importType === 'trello' && workspaceId ? (
                  <Alert color="blue" radius="md">
                    Will import to workspace: {workspaceId}
                  </Alert>
                ) : null}

                {importType === 'csv' ? (
                  <Alert color="blue" radius="md">
                    CSV will be imported to the current board
                  </Alert>
                ) : null}

                <ImportMappingCallout importType={importType} />

                {jobId ? (
                  <Alert color="blue" radius="md">
                    <Group gap="xs">
                      <Text size="sm">Import in progress (Job ID: {jobId})…</Text>
                      {loading ? <Loader size="xs" /> : null}
                    </Group>
                  </Alert>
                ) : null}
              </>
            ) : null}

            <Group justify="flex-end" gap="sm" mt="md">
              <Button
                variant="default"
                radius="md"
                onClick={onClose}
                disabled={importBlocked || cancelDisabled}
              >
                Cancel
              </Button>
              <Button
                color="blue"
                radius="md"
                onClick={() => void handleImport()}
                disabled={!file || !importType || loading || !!jobId}
                loading={loading}
              >
                Import
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="export">
          <Stack gap="md">
            <Select
              label="Export Format"
              value={exportFormat}
              onChange={(value) => setExportFormat((value || 'json') as 'json' | 'csv')}
              data={[
                { value: 'json', label: 'JSON (Complete board data)' },
                { value: 'csv', label: 'CSV (Cards only, configurable columns)' },
              ]}
              disabled={loading}
              radius="md"
            />

            {exportFormat === 'csv' ? (
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

            <Group justify="flex-end" gap="sm" mt="xl">
              <Button variant="default" radius="md" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                color="blue"
                radius="md"
                onClick={() => void handleExport()}
                disabled={loading || (exportFormat === 'csv' && exportColumns.length === 0)}
                loading={loading}
              >
                Export
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

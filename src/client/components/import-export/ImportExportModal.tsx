import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ColorInput,
  Progress,
} from '@mantine/core';
import { IconUpload, IconFileText } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  buildTrelloImportPreflight,
  buildWekanImportPreflight,
  type ImportPreflightPayload,
  type ImportPreflightResult,
  type ImportPreflightUser,
  type ImportUserDecision,
  type InlineButtonIconReplacement,
  type UnmappedUserPolicy,
} from '../../../shared/import/importPreflight.js';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import { loginBrandingColorInputProps } from '../../constants/loginBrandingColorInputProps.js';

const ReplaceButtonsTab = lazy(async () => {
  const m = await import('./ReplaceButtonsTab.js');
  return { default: m.ReplaceButtonsTab };
});

const ImportUserManagementTab = lazy(async () => {
  const m = await import('./ImportUserManagementTab.js');
  return { default: m.ImportUserManagementTab };
});

interface ImportExportModalProps {
  boardId?: string;
  workspaceId?: string;
  onClose: () => void;
  /** Called after a successful import, before the modal closes (e.g. refresh homepage data). */
  onImportComplete?: () => void | Promise<void>;
}

type ImportType = 'trello' | 'wekan' | 'csv' | null;
type TabType = 'import' | 'replace-buttons' | 'import-user-management' | 'export';

interface ImportJobClientView {
  status: string;
  type: ImportJobServerType;
  progress: number;
  totalItems: number;
  processedItems: number;
  currentPhase?: string;
  importErrors?: { item: string; error: string }[];
  result?: Record<string, unknown>;
}

type ImportJobServerType = 'trello' | 'wekan' | 'csv';

function parseImportJob(job: unknown): ImportJobClientView | null {
  if (job == null || typeof job !== 'object') {
    return null;
  }
  const j = job as Record<string, unknown>;
  const status = j.status;
  if (typeof status !== 'string') {
    return null;
  }
  const typeRaw = j.type;
  const type: ImportJobServerType =
    typeRaw === 'trello' || typeRaw === 'wekan' || typeRaw === 'csv' ? typeRaw : 'csv';
  const progress = typeof j.progress === 'number' ? j.progress : 0;
  const totalItems = typeof j.totalItems === 'number' ? j.totalItems : 0;
  const processedItems = typeof j.processedItems === 'number' ? j.processedItems : 0;
  const currentPhase = typeof j.currentPhase === 'string' ? j.currentPhase : undefined;
  const importErrors = Array.isArray(j.importErrors) ? (j.importErrors as { item: string; error: string }[]) : [];
  const result = j.result != null && typeof j.result === 'object' ? (j.result as Record<string, unknown>) : undefined;
  return {
    status,
    type,
    progress,
    totalItems,
    processedItems,
    importErrors,
    ...(currentPhase !== undefined ? { currentPhase } : {}),
    ...(result !== undefined ? { result } : {}),
  };
}

function importPhaseDisplayLabel(phase: string | undefined): string {
  if (phase == null || phase.length === 0) {
    return 'Starting import…';
  }
  switch (phase) {
    case 'boards':
      return 'Importing boards…';
    case 'labels':
      return 'Importing boards and labels…';
    case 'lists':
      return 'Importing lists…';
    case 'cards':
      return 'Importing cards…';
    case 'done':
      return 'Finishing…';
    default:
      return `Importing (${phase})…`;
  }
}

function buildImportSuccessMessage(
  importType: ImportType,
  jobType: ImportJobServerType,
  result: Record<string, unknown> | undefined,
): string {
  const source: ImportType = importType ?? jobType;
  if (source === 'trello') {
    const boardName =
      result != null &&
      typeof result.boardName === 'string' &&
      result.boardName.trim().length > 0
        ? result.boardName.trim()
        : 'your board';
    const listCount = typeof result?.listCount === 'number' ? result.listCount : 0;
    const cardCount = typeof result?.cardCount === 'number' ? result.cardCount : 0;
    return `Successfully imported ${boardName} with ${listCount} list${listCount === 1 ? '' : 's'} and ${cardCount} card${cardCount === 1 ? '' : 's'}.`;
  }
  if (source === 'wekan') {
    const boardName =
      result != null &&
      typeof result.boardName === 'string' &&
      result.boardName.trim().length > 0
        ? result.boardName.trim()
        : 'your board';
    const listCount = typeof result?.listCount === 'number' ? result.listCount : 0;
    const cardCount = typeof result?.cardCount === 'number' ? result.cardCount : 0;
    return `Successfully imported ${boardName} with ${listCount} list${listCount === 1 ? '' : 's'} and ${cardCount} card${cardCount === 1 ? '' : 's'}.`;
  }
  if (source === 'csv') {
    const msg = result != null && typeof result.message === 'string' ? result.message : undefined;
    return msg ?? 'Import completed.';
  }
  return 'Import completed.';
}

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
          { text: 'Members, attachments, comments are imported with preflight mapping', emphasis: true },
        ]
      : importType === 'trello'
        ? [
            { text: 'Trello Boards → KanBoard Workspaces / Boards' },
            { text: 'Trello Lists → KanBoard Columns' },
            { text: 'Trello Cards → KanBoard Cards' },
            { text: 'Trello Labels → KanBoard Labels' },
            { text: 'Trello Checklists → KanBoard Subtasks' },
            { text: 'Members, attachments, comments are imported with preflight mapping', emphasis: true },
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

export function ImportExportModal({
  boardId,
  workspaceId,
  onClose,
  onImportComplete,
}: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [importType, setImportType] = useState<ImportType>('wekan');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importPhaseKey, setImportPhaseKey] = useState<string | undefined>(undefined);
  const [importDefaultHex, setImportDefaultHex] = useState(() =>
    normalizePresetHex('#3b82f6', BOARD_PRESET_COLOURS),
  );
  const [importDefaultUseTheme, setImportDefaultUseTheme] = useState(true);
  const [defaultCardColourModalOpen, setDefaultCardColourModalOpen] = useState(false);
  const [pickerDraftHex, setPickerDraftHex] = useState(() =>
    normalizePresetHex('#3b82f6', BOARD_PRESET_COLOURS),
  );
  const [pickerDraftUseTheme, setPickerDraftUseTheme] = useState(true);
  const [preflight, setPreflight] = useState<ImportPreflightResult | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [userDecisions, setUserDecisions] = useState<ImportUserDecision[]>([]);
  const [unmappedUserPolicy, setUnmappedUserPolicy] = useState<UnmappedUserPolicy>('map_to_importer');
  const [inlineButtonReplacements, setInlineButtonReplacements] = useState<InlineButtonIconReplacement[]>([]);
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

  const preflightUsers: readonly ImportPreflightUser[] = useMemo(() => preflight?.users.users ?? [], [preflight]);
  const needsUserManagement = (importType === 'trello' || importType === 'wekan') && preflightUsers.length > 0;
  const wekanButtons = useMemo(() => (importType === 'wekan' ? preflight?.wekanButtons?.buttons ?? [] : []), [importType, preflight]);
  const needsReplaceButtons = importType === 'wekan' && wekanButtons.length > 0;

  const unresolvedUsersCount = useMemo(() => preflightUsers.filter((u) => {
    const d = userDecisions.find((x) => x.sourceUserId === u.sourceUserId);
    return d == null || (d.mappedUserId == null && d.discard !== true);
  }).length, [preflightUsers, userDecisions]);
  const unresolvedButtonsCount = useMemo(() => {
    if (!needsReplaceButtons) {
      return 0;
    }
    const uniqueIconCount = new Set(wekanButtons.map((b) => b.iconSrc)).size;
    const replacedIconCount = new Set(inlineButtonReplacements.map((r) => r.iconSrc)).size;
    return Math.max(0, uniqueIconCount - replacedIconCount);
  }, [inlineButtonReplacements, needsReplaceButtons, wekanButtons]);

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

  const resetPreflightState = useCallback((): void => {
    setPreflight(null);
    setUserDecisions([]);
    setInlineButtonReplacements([]);
    setUnmappedUserPolicy('map_to_importer');
  }, []);

  const runPreflightForFile = useCallback(async (nextFile: File, nextImportType: ImportType): Promise<void> => {
    if (nextImportType !== 'trello' && nextImportType !== 'wekan') {
      resetPreflightState();
      return;
    }
    setPreflightBusy(true);
    try {
      const rawText = await nextFile.text();
      const parsed = JSON.parse(rawText) as unknown;
      const result =
        nextImportType === 'trello'
          ? buildTrelloImportPreflight(parsed)
          : buildWekanImportPreflight(parsed);
      setPreflight(result);
      setUserDecisions(
        result.users.users.map((u) => ({
          sourceUserId: u.sourceUserId,
        })),
      );
      setInlineButtonReplacements([]);
      setUnmappedUserPolicy('map_to_importer');

      const hasButtons = nextImportType === 'wekan' && (result.wekanButtons?.buttons.length ?? 0) > 0;
      const hasUsers = result.users.users.length > 0;
      if (hasButtons) {
        setActiveTab('replace-buttons');
      } else if (hasUsers) {
        setActiveTab('import-user-management');
      } else {
        setActiveTab('import');
      }
    } catch (err) {
      console.error('Preflight parsing failed:', err);
      setPreflight(null);
      setUserDecisions([]);
      setInlineButtonReplacements([]);
      setError('Could not read import preflight data from this file.');
    } finally {
      setPreflightBusy(false);
    }
  }, [resetPreflightState]);

  const handleImport = async () => {
    if (!file || !importType) return;

    setLoading(true);
    setError(null);
    setImportProgress(0);
    setImportPhaseKey(undefined);

    try {
      let result: { message: string; jobId: string };

      const defaultUncolouredCardColour = importDefaultUseTheme
        ? undefined
        : importDefaultHex.trim();
      const preflightPayload: ImportPreflightPayload | undefined =
        importType === 'trello' || importType === 'wekan'
          ? {
              userDecisions,
              unmappedUserPolicy,
              ...(importType === 'wekan'
                ? { inlineButtonIconReplacements: inlineButtonReplacements }
                : {}),
            }
          : undefined;

      if (importType === 'trello') {
        result = await api.importTrello(
          file,
          workspaceId,
          defaultUncolouredCardColour,
          preflightPayload,
        );
      } else if (importType === 'wekan') {
        result = await api.importWekan(file, defaultUncolouredCardColour, preflightPayload);
      } else if (importType === 'csv') {
        if (!boardId) {
          throw new Error('Board ID is required for CSV import');
        }
        result = await api.importCSV(file, boardId, undefined, defaultUncolouredCardColour);
      } else {
        throw new Error('Invalid import type');
      }

      setJobId(result.jobId);
      void pollJobStatus(result.jobId);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Import failed');
      }
      setLoading(false);
    }
  };

  const clearPollTimers = (): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const pollJobStatus = async (id: string): Promise<void> => {
    clearPollTimers();

    const runTick = async (): Promise<boolean> => {
      if (!isMountedRef.current) {
        clearPollTimers();
        return false;
      }

      try {
        const response = await api.getImportJobStatus(id);
        const job = parseImportJob((response as { job: unknown }).job);

        if (!isMountedRef.current) {
          return false;
        }

        if (job == null) {
          clearPollTimers();
          setLoading(false);
          setError('Invalid import job response');
          return false;
        }

        if (job.status !== 'completed' && job.status !== 'failed') {
          setImportProgress(Math.min(100, Math.max(0, job.progress)));
          setImportPhaseKey(job.currentPhase);
        }

        if (job.status === 'completed') {
          clearPollTimers();
          if (!isMountedRef.current) {
            return false;
          }
          setImportProgress(100);
          setImportPhaseKey('done');
          setLoading(false);
          try {
            await onImportComplete?.();
          } catch (completeErr) {
            console.error('onImportComplete failed:', completeErr);
          }
          notifications.show({
            color: 'green',
            title: 'Import complete',
            message: buildImportSuccessMessage(importType, job.type, job.result),
          });
          onClose();
          return false;
        }

        if (job.status === 'failed') {
          clearPollTimers();
          if (!isMountedRef.current) {
            return false;
          }
          setLoading(false);
          const errors = job.importErrors ?? [];
          setError(`Import failed. ${errors.length > 0 ? `Errors: ${JSON.stringify(errors)}` : ''}`);
          return false;
        }
      } catch {
        if (!isMountedRef.current) {
          return false;
        }
        clearPollTimers();
        setLoading(false);
        setError('Failed to check import status');
        return false;
      }

      return true;
    };

    const continuePolling = await runTick();
    if (!continuePolling || !isMountedRef.current) {
      return;
    }
    intervalRef.current = setInterval(() => {
      void (async () => {
        const next = await runTick();
        if (!next && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      })();
    }, 2000);

    timeoutRef.current = setTimeout(() => {
      clearPollTimers();
      if (isMountedRef.current) {
        setLoading(false);
        setError('Import is taking longer than expected. Please check back later.');
      }
    }, 15 * 60 * 1000);
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
  const isUserManagementTab = activeTab === 'import-user-management';
  const modalStyles = isUserManagementTab
    ? {
        content: {
          width: 'min(70vw, calc(100vw - 48px))',
          maxWidth: 'min(70vw, calc(100vw - 48px))',
          height: 'min(80vh, calc(100vh - 48px))',
          maxHeight: 'min(80vh, calc(100vh - 48px))',
          display: 'flex',
          flexDirection: 'column' as const,
        },
        body: {
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
        },
      }
    : undefined;

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
      size={isUserManagementTab ? 'auto' : 'lg'}
      radius="md"
      padding="lg"
      overlayProps={{ backgroundOpacity: 0.45 }}
      {...(modalStyles != null ? { styles: modalStyles } : {})}
    >
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab((value || 'import') as TabType)}
        keepMounted={false}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="import">Import</Tabs.Tab>
          {needsReplaceButtons ? <Tabs.Tab value="replace-buttons">Replace Buttons</Tabs.Tab> : null}
          {needsUserManagement ? (
            <Tabs.Tab value="import-user-management">Import User Management</Tabs.Tab>
          ) : null}
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
                resetPreflightState();
                setActiveTab('import');
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
                    if (f != null) {
                      void runPreflightForFile(f, importType);
                    } else {
                      resetPreflightState();
                    }
                  }}
                  disabled={loading}
                  radius="md"
                />

                <Box>
                  <Text size="xs" c="dimmed" mb="sm">
                    Same palette as list and card colours. Click the field to choose a default, or
                    “no colour” in the picker to leave cards uncoloured unless the file sets one (CSV:
                    optional <Text component="span" fw={600}>color</Text> as{' '}
                    <Text component="span" fw={600}>
                      #RRGGBB
                    </Text>
                    ).
                  </Text>
                  <ColorInput
                    label="Default colour for uncoloured cards"
                    placeholder="No default colour"
                    disallowInput
                    fixOnBlur={false}
                    {...loginBrandingColorInputProps}
                    withEyeDropper
                    popoverProps={{ opened: false }}
                    value={importDefaultUseTheme ? '' : importDefaultHex}
                    onChange={(next) => {
                      const t = next.trim();
                      if (t.length === 0) {
                        setImportDefaultUseTheme(true);
                        return;
                      }
                      setImportDefaultHex(normalizePresetHex(t, BOARD_PRESET_COLOURS));
                      setImportDefaultUseTheme(false);
                    }}
                    leftSection={
                      importDefaultUseTheme ? (
                        <Box
                          aria-hidden
                          style={{
                            width: 'var(--ci-preview-size)',
                            height: 'var(--ci-preview-size)',
                            borderRadius: 'var(--mantine-radius-sm)',
                            border: '1px solid var(--mantine-color-gray-4)',
                            background:
                              'repeating-linear-gradient(45deg, #f1f3f5 0 4px, #e9ecef 4px 8px)',
                            flexShrink: 0,
                          }}
                        />
                      ) : undefined
                    }
                    onClick={() => {
                      if (loading) return;
                      setPickerDraftHex(
                        normalizePresetHex(importDefaultHex || '#3b82f6', BOARD_PRESET_COLOURS),
                      );
                      setPickerDraftUseTheme(importDefaultUseTheme);
                      setDefaultCardColourModalOpen(true);
                    }}
                    disabled={loading}
                    styles={{ input: { cursor: loading ? 'not-allowed' : 'pointer' } }}
                  />
                </Box>

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

                {preflightBusy ? (
                  <Alert color="blue" radius="md">
                    Analysing import file…
                  </Alert>
                ) : null}
                {!preflightBusy && needsReplaceButtons ? (
                  <Alert color="orange" radius="md">
                    Found legacy Wekan inline buttons. Use the <strong>Replace Buttons</strong> tab to upload
                    replacement icons before import.
                  </Alert>
                ) : null}
                {!preflightBusy && needsUserManagement ? (
                  <Alert color="blue" radius="md">
                    Found {preflightUsers.length} import user(s). Review mappings in{' '}
                    <strong>Import User Management</strong>.
                  </Alert>
                ) : null}

                {jobId ? (
                  <Alert color="blue" radius="md">
                    <Stack gap="sm">
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                          {importPhaseDisplayLabel(importPhaseKey)}
                        </Text>
                        {loading ? <Loader size="xs" /> : null}
                      </Group>
                      <Progress
                        value={importProgress}
                        radius="md"
                        size="sm"
                        animated={loading && importProgress < 100}
                      />
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text size="xs" c="dimmed">
                          {importProgress}%
                        </Text>
                        <Text size="xs" c="dimmed" style={{ textAlign: 'right' }} truncate>
                          Job {jobId}
                        </Text>
                      </Group>
                    </Stack>
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
                onClick={() => {
                  if (needsReplaceButtons) {
                    setActiveTab('replace-buttons');
                    return;
                  }
                  if (needsUserManagement) {
                    setActiveTab('import-user-management');
                    return;
                  }
                  void handleImport();
                }}
                disabled={!file || !importType || loading || !!jobId || preflightBusy}
                loading={loading}
              >
                {needsReplaceButtons || needsUserManagement ? 'Continue preflight' : 'Import'}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="replace-buttons">
          <Stack gap="md">
            <Suspense fallback={<Loader size="sm" />}>
              <ReplaceButtonsTab
                buttons={wekanButtons}
                replacements={inlineButtonReplacements}
                onChangeReplacements={(next) => setInlineButtonReplacements([...next])}
              />
            </Suspense>
            <Group justify="flex-end" gap="sm" mt="md">
              <Button
                variant="default"
                radius="md"
                onClick={() => setActiveTab('import')}
                disabled={loading}
              >
                Back to Import
              </Button>
              <Button
                color="blue"
                radius="md"
                onClick={() => {
                  if (needsUserManagement) {
                    setActiveTab('import-user-management');
                    return;
                  }
                  void handleImport();
                }}
                disabled={!file || !importType || loading || !!jobId}
              >
                {needsUserManagement
                  ? 'Continue'
                  : unresolvedButtonsCount > 0
                    ? `Import (${unresolvedButtonsCount} icon source${unresolvedButtonsCount === 1 ? '' : 's'} unchanged)`
                    : 'Import'}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="import-user-management">
          <Stack gap="md">
            <Suspense fallback={<Loader size="sm" />}>
              <ImportUserManagementTab
                users={preflightUsers}
                decisions={userDecisions}
                policy={unmappedUserPolicy}
                onChangeDecisions={(next) => setUserDecisions([...next])}
                onChangePolicy={setUnmappedUserPolicy}
              />
            </Suspense>
            <Group justify="space-between" gap="sm" mt="md">
              <Text size="xs" c={unresolvedUsersCount > 0 ? 'orange' : 'green'}>
                {unresolvedUsersCount} unresolved user(s); policy: {unmappedUserPolicy}
              </Text>
              <Group gap="sm">
                <Button
                  variant="default"
                  radius="md"
                  onClick={() => setActiveTab(needsReplaceButtons ? 'replace-buttons' : 'import')}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  color="blue"
                  radius="md"
                  onClick={() => void handleImport()}
                  disabled={!file || !importType || loading || !!jobId}
                  loading={loading}
                >
                  Save users and import
                </Button>
              </Group>
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

      <Modal
        opened={defaultCardColourModalOpen}
        onClose={() => setDefaultCardColourModalOpen(false)}
        title="Default colour for uncoloured cards"
        centered
        size="lg"
        radius="md"
        zIndex={520}
        overlayProps={{ backgroundOpacity: 0.45 }}
        padding="lg"
      >
        <Stack gap="md">
          <BoardColourPickerPanel
            value={pickerDraftHex}
            onChange={(hex) => {
              setPickerDraftHex(hex);
              setPickerDraftUseTheme(false);
            }}
            onClearColor={() => setPickerDraftUseTheme(true)}
            noColorSelected={pickerDraftUseTheme}
          />
          <Group justify="flex-end" gap="sm" mt="md">
            <Button variant="default" radius="md" onClick={() => setDefaultCardColourModalOpen(false)}>
              Cancel
            </Button>
            <Button
              radius="md"
              onClick={() => {
                setImportDefaultHex(pickerDraftHex);
                setImportDefaultUseTheme(pickerDraftUseTheme);
                setDefaultCardColourModalOpen(false);
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}

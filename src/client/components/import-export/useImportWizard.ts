import { useCallback, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  LONG_TASK_NOTIFICATION_POSITION,
  renderStartupProgressMessage,
  wait,
} from '../../utils/longTaskProgressNotifications.js';
import {
  buildTrelloImportPreflight,
  buildWekanImportPreflight,
  type ImportPreflightPayload,
  type ImportPreflightResult,
  type InlineButtonIconReplacement,
  type InlineButtonImportColorOverrides,
} from '../../../shared/import/importPreflight.js';
import { assertImportJsonMatchesSource } from '../../../shared/import/detectImportJsonSource.js';
import { assertAtlantisboardExportShape } from '../../../shared/import/atlantisboardNormalize.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import {
  IMPORT_PROGRESS_NOTIFICATION_ID,
  pollImportJobWithNotifications,
  type ImportType,
} from '../../utils/importJobUtils.js';

export type ImportWizardTab = 'import' | 'replace-buttons' | 'user-management';

type JsonImportType = 'trello' | 'wekan' | 'atlantisboard';

interface ImportStrategyContext {
  readonly file: File;
  readonly workspaceId?: string | undefined;
  readonly boardId?: string | undefined;
  readonly defaultUncolouredCardColour: string | undefined;
  readonly preflightPayload: ImportPreflightPayload | undefined;
  readonly parsedJson: unknown | null;
}

type ImportStrategy = {
  readonly kind: JsonImportType | 'csv';
  readonly requiresPreflightJson: boolean;
  readonly validateParsed?: (parsed: unknown) => void;
  readonly execute: (ctx: ImportStrategyContext) => Promise<{ message: string; jobId: string }>;
};

const IMPORT_STRATEGIES: Readonly<Record<Exclude<ImportType, null>, ImportStrategy>> = {
  trello: {
    kind: 'trello',
    requiresPreflightJson: true,
    validateParsed: (parsed) => assertImportJsonMatchesSource(parsed, 'trello'),
    execute: ({ file, workspaceId, defaultUncolouredCardColour, preflightPayload }) =>
      api.importTrello(file, workspaceId, defaultUncolouredCardColour, preflightPayload),
  },
  wekan: {
    kind: 'wekan',
    requiresPreflightJson: true,
    validateParsed: (parsed) => assertImportJsonMatchesSource(parsed, 'wekan'),
    execute: ({ file, defaultUncolouredCardColour, preflightPayload }) =>
      api.importWekan(file, defaultUncolouredCardColour, preflightPayload),
  },
  atlantisboard: {
    kind: 'atlantisboard',
    requiresPreflightJson: true,
    validateParsed: (parsed) => assertAtlantisboardExportShape(parsed),
    execute: ({ file, workspaceId }) => api.importAtlantisboard(file, workspaceId),
  },
  csv: {
    kind: 'csv',
    requiresPreflightJson: false,
    execute: ({ file, boardId, defaultUncolouredCardColour }) => {
      if (boardId == null) {
        throw new Error('Board ID is required for CSV import');
      }
      return api.importCSV(file, boardId, undefined, defaultUncolouredCardColour);
    },
  },
};

export interface UseImportWizardOptions {
  readonly boardId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly onImportComplete?: (() => void | Promise<void>) | undefined;
  readonly onClose: () => void;
}

export function useImportWizard(options: UseImportWizardOptions) {
  const { boardId, workspaceId, onImportComplete, onClose } = options;

  const [activeTab, setActiveTab] = useState<ImportWizardTab>('import');
  const [importType, setImportType] = useState<ImportType>('wekan');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [parsedPreflightJson, setParsedPreflightJson] = useState<unknown | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [inlineButtonReplacements, setInlineButtonReplacements] = useState<InlineButtonIconReplacement[]>([]);
  const [inlineButtonColorOverrides, setInlineButtonColorOverrides] =
    useState<InlineButtonImportColorOverrides>({});
  const [importUsersAsPlaceholders, setImportUsersAsPlaceholders] = useState(false);

  const wekanButtons = useMemo(
    () => (importType === 'wekan' ? preflight?.wekanButtons?.buttons ?? [] : []),
    [importType, preflight],
  );
  const needsReplaceButtons = importType === 'wekan' && wekanButtons.length > 0;
  const showUserManagementTab = importType === 'trello' || importType === 'wekan';
  const showDefaultCardColourPicker = importType !== 'atlantisboard';

  const unresolvedButtonsCount = useMemo(() => {
    if (!needsReplaceButtons) {
      return 0;
    }
    const uniqueIconCount = new Set(wekanButtons.map((b) => b.iconSrc)).size;
    const replacedIconCount = new Set(inlineButtonReplacements.map((r) => r.iconSrc)).size;
    return Math.max(0, uniqueIconCount - replacedIconCount);
  }, [inlineButtonReplacements, needsReplaceButtons, wekanButtons]);

  const resetPreflightState = useCallback((): void => {
    setPreflight(null);
    setParsedPreflightJson(null);
    setInlineButtonReplacements([]);
    setInlineButtonColorOverrides({});
    setImportUsersAsPlaceholders(false);
  }, []);

  const runPreflightForFile = useCallback(async (nextFile: File, nextImportType: ImportType): Promise<void> => {
    if (nextImportType === 'atlantisboard') {
      setPreflightBusy(true);
      try {
        setError(null);
        const rawText = await nextFile.text();
        const parsed = JSON.parse(rawText) as unknown;
        assertAtlantisboardExportShape(parsed);
        setPreflight(null);
        setInlineButtonReplacements([]);
        setInlineButtonColorOverrides({});
        setImportUsersAsPlaceholders(false);
        setParsedPreflightJson(parsed);
        setActiveTab('import');
      } catch (err) {
        console.error('Atlantisboard import JSON validation failed:', err);
        const msg = err instanceof Error ? err.message : 'Could not validate import file.';
        setError(msg);
        resetPreflightState();
      } finally {
        setPreflightBusy(false);
      }
      return;
    }
    if (nextImportType !== 'wekan' && nextImportType !== 'trello') {
      resetPreflightState();
      return;
    }
    setPreflightBusy(true);
    try {
      setError(null);
      const rawText = await nextFile.text();
      const parsed = JSON.parse(rawText) as unknown;
      try {
        assertImportJsonMatchesSource(parsed, nextImportType);
      } catch (shapeErr) {
        console.error('Import JSON shape check failed:', shapeErr);
        const msg = shapeErr instanceof Error ? shapeErr.message : 'Could not validate import file.';
        setError(msg);
        resetPreflightState();
        return;
      }
      const result =
        nextImportType === 'wekan' ? buildWekanImportPreflight(parsed) : buildTrelloImportPreflight(parsed);
      setParsedPreflightJson(parsed);
      setPreflight(result);
      setInlineButtonReplacements([]);
      setInlineButtonColorOverrides({});

      const hasButtons = nextImportType === 'wekan' && (result.wekanButtons?.buttons.length ?? 0) > 0;
      if (hasButtons) {
        setActiveTab('replace-buttons');
      } else if (nextImportType === 'trello' || nextImportType === 'wekan') {
        setActiveTab('user-management');
      } else {
        setActiveTab('import');
      }
    } catch (err) {
      console.error('Preflight parsing failed:', err);
      setPreflight(null);
      setParsedPreflightJson(null);
      setInlineButtonReplacements([]);
      setError('Could not read import preflight data from this file.');
    } finally {
      setPreflightBusy(false);
    }
  }, [resetPreflightState]);

  const handleImport = useCallback(async () => {
    if (!file || !importType) {
      return;
    }

    const strategy = IMPORT_STRATEGIES[importType];
    const nextFile = file;
    const nextParsedPreflightJson = parsedPreflightJson;
    const nextDefaultUncolouredCardColour = importDefaultUseTheme ? undefined : importDefaultHex.trim();
    const nextPreflightPayload: ImportPreflightPayload | undefined =
      importType === 'trello' || importType === 'wekan'
        ? {
            userDecisions: [],
            unmappedUserPolicy: importUsersAsPlaceholders ? 'create_placeholders' : 'discard_unmapped',
            ...(importType === 'wekan'
              ? {
                  inlineButtonIconReplacements: inlineButtonReplacements,
                  ...(inlineButtonColorOverrides.textColor != null ||
                  inlineButtonColorOverrides.bgColor != null
                    ? { inlineButtonImportColorOverrides: inlineButtonColorOverrides }
                    : {}),
                }
              : {}),
          }
        : undefined;

    onClose();

    notifications.show({
      id: IMPORT_PROGRESS_NOTIFICATION_ID,
      color: 'blue',
      title: 'Import starting',
      message: renderStartupProgressMessage('Preparing import request…', 2),
      loading: true,
      autoClose: false,
      withCloseButton: false,
      position: LONG_TASK_NOTIFICATION_POSITION,
    });

    void (async () => {
      try {
        await wait(0);

        if (strategy.requiresPreflightJson) {
          notifications.update({
            id: IMPORT_PROGRESS_NOTIFICATION_ID,
            color: 'blue',
            title: 'Import starting',
            message: renderStartupProgressMessage(
              nextParsedPreflightJson != null ? 'Validating import file…' : 'Parsing import file…',
              12,
            ),
            loading: true,
            autoClose: false,
            withCloseButton: false,
            position: LONG_TASK_NOTIFICATION_POSITION,
          });
          let parsed: unknown;
          if (nextParsedPreflightJson != null) {
            parsed = nextParsedPreflightJson;
          } else {
            const rawText = await nextFile.text();
            try {
              parsed = JSON.parse(rawText) as unknown;
            } catch {
              throw new Error('Invalid JSON in import file.');
            }
          }
          strategy.validateParsed?.(parsed);
        }

        const result = await strategy.execute({
          file: nextFile,
          workspaceId,
          boardId,
          defaultUncolouredCardColour: nextDefaultUncolouredCardColour,
          preflightPayload: nextPreflightPayload,
          parsedJson: nextParsedPreflightJson,
        });

        notifications.update({
          id: IMPORT_PROGRESS_NOTIFICATION_ID,
          color: 'blue',
          title: 'Import started',
          message: renderStartupProgressMessage('Import job created. Polling progress…', 20),
          loading: true,
          autoClose: false,
          withCloseButton: false,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
        await pollImportJobWithNotifications(result.jobId, importType, onImportComplete);
      } catch (err) {
        let message = 'Import failed to start.';
        if (isAxiosError(err)) {
          const data = err.response?.data as { error?: { message?: string } } | undefined;
          message = data?.error?.message ?? err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        notifications.update({
          id: IMPORT_PROGRESS_NOTIFICATION_ID,
          color: 'red',
          title: 'Import start failed',
          message,
          loading: false,
          autoClose: false,
          withCloseButton: true,
          position: LONG_TASK_NOTIFICATION_POSITION,
        });
      }
    })();
  }, [
    boardId,
    file,
    importDefaultHex,
    importDefaultUseTheme,
    importType,
    importUsersAsPlaceholders,
    inlineButtonColorOverrides,
    inlineButtonReplacements,
    onClose,
    onImportComplete,
    parsedPreflightJson,
    workspaceId,
  ]);

  const handleImportTypeChange = useCallback(
    (value: ImportType) => {
      setImportType(value);
      setFile(null);
      resetPreflightState();
      setActiveTab('import');
    },
    [resetPreflightState],
  );

  const handleFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      setError(null);
      if (nextFile != null && importType != null) {
        void runPreflightForFile(nextFile, importType);
      } else {
        resetPreflightState();
      }
    },
    [importType, resetPreflightState, runPreflightForFile],
  );

  const fileLabel =
    importType === 'wekan'
      ? 'Wekan Export File'
      : importType === 'trello'
        ? 'Trello Export File'
        : importType === 'atlantisboard'
          ? 'Atlantisboard Export File'
          : importType === 'csv'
            ? 'CSV / TSV File'
            : 'Export File';

  return {
    activeTab,
    setActiveTab,
    importType,
    file,
    loading,
    setLoading,
    error,
    setError,
    importDefaultHex,
    setImportDefaultHex,
    importDefaultUseTheme,
    setImportDefaultUseTheme,
    defaultCardColourModalOpen,
    setDefaultCardColourModalOpen,
    pickerDraftHex,
    setPickerDraftHex,
    pickerDraftUseTheme,
    setPickerDraftUseTheme,
    preflight,
    preflightBusy,
    inlineButtonReplacements,
    setInlineButtonReplacements,
    inlineButtonColorOverrides,
    setInlineButtonColorOverrides,
    importUsersAsPlaceholders,
    setImportUsersAsPlaceholders,
    wekanButtons,
    needsReplaceButtons,
    showUserManagementTab,
    showDefaultCardColourPicker,
    unresolvedButtonsCount,
    fileLabel,
    handleImport,
    handleImportTypeChange,
    handleFileChange,
    workspaceId,
    boardId,
  };
}

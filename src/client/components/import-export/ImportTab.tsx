import { lazy, Suspense } from 'react';
import {
  Alert,
  Box,
  Button,
  ColorInput,
  FileInput,
  Group,
  Loader,
  Select,
  Stack,
} from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { ImportUserManagementTab } from './ImportUserManagementTab.js';
import { loginBrandingColorInputProps } from '../../constants/loginBrandingColorInputProps.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import {
  ImportMappingCallout,
  PANEL_FOOTER_STYLE,
  PANEL_SCROLL_AREA_STYLE,
  type ImportType,
} from '../../utils/importJobUtils.js';
import type { useImportWizard } from './useImportWizard.js';

const ReplaceButtonsTab = lazy(async () => {
  const m = await import('./ReplaceButtonsTab.js');
  return { default: m.ReplaceButtonsTab };
});

type Wizard = ReturnType<typeof useImportWizard>;

interface ImportTabProps {
  readonly wizard: Wizard;
  readonly onClose: () => void;
}

export function ImportTab({ wizard, onClose }: ImportTabProps) {
  const {
    activeTab,
    setActiveTab,
    importType,
    file,
    loading,
    importDefaultHex,
    setImportDefaultHex,
    importDefaultUseTheme,
    setImportDefaultUseTheme,
    setDefaultCardColourModalOpen,
    setPickerDraftHex,
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
  } = wizard;

  if (activeTab === 'replace-buttons') {
    return (
      <Stack gap="md" style={{ minHeight: 0, flex: 1 }}>
        <Box style={PANEL_SCROLL_AREA_STYLE}>
          <Suspense fallback={<Loader size="sm" />}>
            <ReplaceButtonsTab
              buttons={wekanButtons}
              replacements={inlineButtonReplacements}
              onChangeReplacements={(next) => setInlineButtonReplacements([...next])}
              colorOverrides={inlineButtonColorOverrides}
              onChangeColorOverrides={setInlineButtonColorOverrides}
            />
          </Suspense>
        </Box>
        <Group justify="flex-end" gap="sm" style={PANEL_FOOTER_STYLE}>
          <Button variant="default" radius="md" onClick={() => setActiveTab('import')} disabled={loading}>
            Back to Import
          </Button>
          <Button
            color="blue"
            radius="md"
            onClick={() => {
              if (showUserManagementTab) {
                setActiveTab('user-management');
                return;
              }
              void handleImport();
            }}
            disabled={!file || !importType || loading}
          >
            {unresolvedButtonsCount > 0
              ? `Continue (${unresolvedButtonsCount} icon source${unresolvedButtonsCount === 1 ? '' : 's'} unchanged)`
              : 'Continue'}
          </Button>
        </Group>
      </Stack>
    );
  }

  if (activeTab === 'user-management') {
    return (
      <Stack gap="md" style={{ minHeight: 0, flex: 1 }}>
        <Box style={PANEL_SCROLL_AREA_STYLE}>
          <ImportUserManagementTab
            preflight={preflight}
            importUsersAsPlaceholders={importUsersAsPlaceholders}
            onImportUsersAsPlaceholdersChange={setImportUsersAsPlaceholders}
          />
        </Box>
        <Group justify="flex-end" gap="sm" style={PANEL_FOOTER_STYLE}>
          <Button
            variant="default"
            radius="md"
            onClick={() => {
              if (needsReplaceButtons) {
                setActiveTab('replace-buttons');
              } else {
                setActiveTab('import');
              }
            }}
            disabled={loading}
          >
            Back
          </Button>
          <Button
            color="blue"
            radius="md"
            onClick={() => void handleImport()}
            disabled={!file || !importType || loading}
            loading={loading}
          >
            Import
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" style={{ minHeight: 0, flex: 1 }}>
      <Box style={PANEL_SCROLL_AREA_STYLE}>
        <Select
          label="Import Source"
          placeholder="Select import source…"
          value={importType ?? ''}
          onChange={(value) => handleImportTypeChange((value as ImportType) || null)}
          data={[
            { value: 'wekan', label: 'Wekan JSON' },
            { value: 'trello', label: 'Trello JSON' },
            { value: 'atlantisboard', label: 'Atlantisboard JSON' },
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
              onChange={handleFileChange}
              disabled={loading}
              radius="md"
            />

            {showDefaultCardColourPicker ? (
              <Box>
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
            ) : null}

            {(importType === 'trello' || importType === 'atlantisboard') && workspaceId ? (
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
          </>
        ) : null}
      </Box>
      <Group justify="flex-end" gap="sm" style={PANEL_FOOTER_STYLE}>
        <Button variant="default" radius="md" onClick={onClose} disabled={loading}>
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
            if (showUserManagementTab && file != null) {
              setActiveTab('user-management');
              return;
            }
            void handleImport();
          }}
          disabled={!file || !importType || loading || preflightBusy}
          loading={loading}
        >
          {needsReplaceButtons
            ? 'Continue preflight'
            : showUserManagementTab && file != null
              ? 'Continue'
              : 'Import'}
        </Button>
      </Group>
    </Stack>
  );
}

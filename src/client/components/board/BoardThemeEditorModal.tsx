import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Alert, Button, ColorInput, Flex, Group, Modal, Stack, Switch, Text, TextInput } from '@mantine/core';
import {
  BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES,
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import { applySmartContrastToThemePalette, getBoardPaletteScrollbarColors, getDerivedBoardTextColors } from '../../utils/boardThemeStyle.js';
import { BoardThemeEditorModalPreview } from './BoardThemeEditorModalPreview.js';
import './boardThemeEditorModal.css';

/** Mantine `ColorInput` types `swatches` as mutable `string[]`; copy once at load. */
const BOARD_THEME_COLOR_INPUT_SWATCHES: string[] = BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES.slice();

const EDITABLE_THEME_FIELDS: ReadonlyArray<{
  section: 'navbar' | 'lists' | 'cardDetail' | 'scrollbar';
  key: keyof BoardThemeDefinition['palette'];
  label: string;
  help?: string;
}> = [
  { section: 'navbar', key: 'canvasBg', label: 'Board Background Colour' },
  { section: 'navbar', key: 'navbarBg', label: 'Background Colour' },
  { section: 'navbar', key: 'navbarBorder', label: 'Icon Colour' },
  { section: 'lists', key: 'listBg', label: 'Background Colour' },
  { section: 'lists', key: 'listHeaderText', label: 'List Title Text' },
  { section: 'lists', key: 'listMuted', label: 'Muted Text (count, menu)' },
  { section: 'lists', key: 'listMutedStrong', label: 'Muted Strong (add row hover)' },
  { section: 'lists', key: 'listControlHoverBg', label: 'Control Hover Background' },
  { section: 'lists', key: 'addListBg', label: 'Add List Button Background' },
  { section: 'lists', key: 'addListBgHover', label: 'Add List Button Hover' },
  { section: 'cardDetail', key: 'cardDetailBg', label: 'Background Colour' },
  { section: 'cardDetail', key: 'cardDetailTitleText', label: 'Card Title Text' },
  {
    section: 'cardDetail',
    key: 'cardDetailText',
    label: 'Text Colour (Labels & Headers)',
    help: 'Applies to section labels and secondary headers (not the main card title).',
  },
  { section: 'cardDetail', key: 'cardDetailButtonBg', label: 'Button Colour' },
  { section: 'cardDetail', key: 'cardDetailButtonText', label: 'Button Text Colour' },
  { section: 'cardDetail', key: 'cardDetailButtonHoverBg', label: 'Button Hover Colour' },
  { section: 'cardDetail', key: 'cardDetailButtonHoverText', label: 'Button Hover Text Colour' },
  { section: 'scrollbar', key: 'scrollbarColor', label: 'Scrollbar Colour' },
];

interface BoardThemeEditorModalProps {
  opened: boolean;
  variant?: 'add' | 'edit';
  initialSettings?: BoardThemeSettings;
  isSaving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (settings: BoardThemeSettings) => Promise<void> | void;
}

function themeEditorHasMeaningfulDiff(next: BoardThemeSettings, baseline: BoardThemeSettings): boolean {
  if (next.selectedTheme.id !== baseline.selectedTheme.id) {
    return true;
  }
  if (next.selectedTheme.name.trim() !== baseline.selectedTheme.name.trim()) {
    return true;
  }
  if (next.smartContrast !== baseline.smartContrast) {
    return true;
  }
  for (const f of EDITABLE_THEME_FIELDS) {
    if (next.selectedTheme.palette[f.key] !== baseline.selectedTheme.palette[f.key]) {
      return true;
    }
  }
  return false;
}

export function BoardThemeEditorModal({
  opened,
  variant = 'edit',
  initialSettings,
  isSaving = false,
  error = null,
  onClose,
  onSave,
}: BoardThemeEditorModalProps) {
  const base = useMemo(
    () => normalizeBoardThemeSettings(initialSettings, createDefaultBoardThemeSettings()),
    [initialSettings],
  );
  const [draft, setDraft] = useState<BoardThemeSettings>(base);

  const baseRef = useRef(base);
  baseRef.current = base;
  const handleModalEnterTransitionEnd = useCallback(() => {
    if (!opened) {
      return;
    }
    setDraft(baseRef.current);
  }, [opened]);

  const hasUnsavedChanges = useMemo(() => themeEditorHasMeaningfulDiff(draft, base), [draft, base]);

  const canSaveChanges = variant === 'add' ? !isSaving : hasUnsavedChanges && !isSaving;

  const palette = draft.selectedTheme.palette;

  const previewPalette = useMemo(
    () => applySmartContrastToThemePalette(draft.selectedTheme.palette, draft.smartContrast),
    [draft.selectedTheme.palette, draft.smartContrast],
  );

  const previewDerivedText = useMemo(
    () => getDerivedBoardTextColors(previewPalette, draft.selectedTheme.id),
    [draft.selectedTheme.id, previewPalette],
  );
  const previewScrollbar = useMemo(() => getBoardPaletteScrollbarColors(previewPalette), [previewPalette]);

  const sharedColorInputProps = useMemo(
    () => ({
      withPicker: true,
      format: 'hexa' as const,
      swatches: BOARD_THEME_COLOR_INPUT_SWATCHES,
      swatchesPerRow: 10,
      styles: {
        root: { width: 'fit-content', maxWidth: '100%' },
        input: { minWidth: '11.5rem' },
      },
    }),
    [],
  );

  const setPaletteColor = useCallback((key: keyof BoardThemeDefinition['palette'], value: string) => {
    setDraft((prev) => {
      const next: BoardThemeSettings = {
        ...prev,
        selectedTheme: {
          ...prev.selectedTheme,
          palette: {
            ...prev.selectedTheme.palette,
            [key]: value,
          },
        },
      };
      if (key === 'canvasBg') {
        next.backgroundColor = value;
      }
      return next;
    });
  }, []);

  const sectionFields = (section: 'navbar' | 'lists' | 'cardDetail' | 'scrollbar') =>
    EDITABLE_THEME_FIELDS.filter((entry) => entry.section === section);

  const modalTitle = variant === 'add' ? 'Add Theme' : 'Edit Theme';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={modalTitle}
      centered={false}
      yOffset={0}
      size="100%"
      onEnterTransitionEnd={handleModalEnterTransitionEnd}
      classNames={{
        inner: 'board-theme-editor-modal__inner',
        content: 'board-theme-editor-modal__content',
        header: 'board-theme-editor-modal__header',
        title: 'board-theme-editor-modal__title',
        body: 'board-theme-editor-modal__body',
      }}
    >
      <Stack gap="md" className="board-theme-editor-modal__body-stack">
        {error != null ? <Alert color="red">{error}</Alert> : null}

        <Flex
          gap="xl"
          direction={{ base: 'column', md: 'row' }}
          align="stretch"
          wrap="nowrap"
          className="board-theme-editor-modal__split"
        >
          <Stack gap="md" className="board-theme-editor-modal__form-column">
            <TextInput
              label="Theme Name"
              value={draft.selectedTheme.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const name = event.currentTarget.value;
                setDraft((prev) => ({
                  ...prev,
                  selectedTheme: {
                    ...prev.selectedTheme,
                    name,
                  },
                }));
              }}
            />

            <Stack gap="xs" className="board-theme-editor-modal__section">
              <Text className="board-theme-editor-modal__section-title">NAVBAR</Text>
              {sectionFields('navbar').map((field) => (
                <ColorInput
                  key={field.key}
                  label={field.label}
                  value={palette[field.key]}
                  onChange={(value) => setPaletteColor(field.key, value)}
                  {...sharedColorInputProps}
                />
              ))}
            </Stack>

            <Stack gap="xs" className="board-theme-editor-modal__section">
              <Text className="board-theme-editor-modal__section-title">LISTS / COLUMNS</Text>
              {sectionFields('lists').map((field) => (
                <ColorInput
                  key={field.key}
                  label={field.label}
                  value={palette[field.key]}
                  onChange={(value) => setPaletteColor(field.key, value)}
                  {...sharedColorInputProps}
                />
              ))}
            </Stack>

            <Stack gap="xs" className="board-theme-editor-modal__section">
              <Text className="board-theme-editor-modal__section-title">CARD DETAIL WINDOW</Text>
              {sectionFields('cardDetail').map((field) => (
                <Stack key={field.key} gap={2}>
                  <ColorInput
                    label={field.label}
                    value={palette[field.key]}
                    onChange={(value) => setPaletteColor(field.key, value)}
                    {...sharedColorInputProps}
                  />
                  {field.help != null ? (
                    <Text c="dimmed" size="xs">
                      {field.help}
                    </Text>
                  ) : null}
                </Stack>
              ))}
              <Switch
                label="Intelligent Contrast"
                checked={draft.smartContrast}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const smartContrast = event.currentTarget.checked;
                  setDraft((prev) => ({
                    ...prev,
                    smartContrast,
                  }));
                }}
              />
            </Stack>

            <Stack gap="xs" className="board-theme-editor-modal__section">
              <Text className="board-theme-editor-modal__section-title">SCROLLBARS</Text>
              {sectionFields('scrollbar').map((field) => (
                <ColorInput
                  key={field.key}
                  label={field.label}
                  value={palette[field.key]}
                  onChange={(value) => setPaletteColor(field.key, value)}
                  {...sharedColorInputProps}
                />
              ))}
            </Stack>
          </Stack>

          <BoardThemeEditorModalPreview
            previewPalette={previewPalette}
            navFg={previewDerivedText.navFg}
            cardDetailTitle={previewDerivedText.cardDetailTitle}
            cardDetailProse={previewDerivedText.cardDetailProse}
            scrollbarThumb={previewScrollbar.thumb}
            scrollbarTrack={previewScrollbar.track}
          />
        </Flex>

        <Group justify="flex-end" wrap="nowrap" w="100%" className="board-theme-editor-modal__footer">
          <Group wrap="nowrap">
            <Button variant="default" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={() => void onSave(draft)} loading={isSaving} disabled={!canSaveChanges}>
              Save Changes
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

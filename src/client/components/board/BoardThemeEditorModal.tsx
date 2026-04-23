import { useCallback, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Alert, Box, Button, ColorInput, Flex, Group, Modal, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconSettings } from '@tabler/icons-react';
import {
  BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES,
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  type BoardThemeDefinition,
  type BoardThemePalette,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import {
  applySmartContrastToThemePalette,
  getBoardPaletteScrollbarColors,
  getDerivedBoardTextColors,
} from '../../utils/boardThemeStyle.js';
import './boardThemeEditorModal.css';

/** Mantine `ColorInput` types `swatches` as mutable `string[]`; copy once at load. */
const BOARD_THEME_COLOR_INPUT_SWATCHES: string[] = BOARD_THEME_EDITOR_NAV_CANVAS_SWATCHES.slice();

const CARD_DETAIL_PREVIEW_LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.';

const PREVIEW_BOARD_TITLE = 'Sample Board';
const PREVIEW_USER_NAME = 'Alex Doe';

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
  {
    section: 'cardDetail',
    key: 'cardDetailBg',
    label: 'Background Colour',
  },
  {
    section: 'cardDetail',
    key: 'cardDetailTitleText',
    label: 'Card Title Text',
  },
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
  /** `add` opens the flow for a new custom theme; `edit` edits the selected custom theme. */
  variant?: 'add' | 'edit';
  initialSettings?: BoardThemeSettings;
  isSaving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (settings: BoardThemeSettings) => Promise<void> | void;
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
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);

  const baseRef = useRef(base);
  baseRef.current = base;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const previewCacheRef = useRef<BoardThemePalette>(
    applySmartContrastToThemePalette(base.selectedTheme.palette, base.smartContrast),
  );

  const handleModalEnterTransitionEnd = useCallback(() => {
    if (!opened) {
      return;
    }
    const nextBase = baseRef.current;
    setDraft(nextBase);
    setIsColorPopoverOpen(false);
  }, [opened]);

  const hasUnsavedChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(base), [base, draft]);

  const canSaveChanges =
    variant === 'add' ? !isSaving : hasUnsavedChanges && !isSaving;

  const palette = draft.selectedTheme.palette;

  const previewPalette = useMemo(() => {
    if (!isColorPopoverOpen) {
      const computed = applySmartContrastToThemePalette(draft.selectedTheme.palette, draft.smartContrast);
      previewCacheRef.current = computed;
      return computed;
    }
    return previewCacheRef.current;
  }, [draft.selectedTheme.palette, draft.smartContrast, draft.selectedTheme.id, isColorPopoverOpen]);

  const previewDerivedText = useMemo(
    () => getDerivedBoardTextColors(previewPalette, draft.selectedTheme.id),
    [draft.selectedTheme.id, previewPalette],
  );
  const previewScrollbar = useMemo(() => getBoardPaletteScrollbarColors(previewPalette), [previewPalette]);

  const handleColorPopoverOpen = useCallback(() => {
    previewCacheRef.current = applySmartContrastToThemePalette(
      draftRef.current.selectedTheme.palette,
      draftRef.current.smartContrast,
    );
    setIsColorPopoverOpen(true);
  }, []);
  const handleColorPopoverClose = useCallback(() => {
    setIsColorPopoverOpen(false);
  }, []);

  const sharedColorInputProps = useMemo(
    () => ({
      withPicker: true,
      format: 'hexa' as const,
      swatches: BOARD_THEME_COLOR_INPUT_SWATCHES,
      swatchesPerRow: 10,
      popoverProps: {
        transitionProps: { transition: 'fade' as const, duration: 0 },
        onOpen: handleColorPopoverOpen,
        onClose: handleColorPopoverClose,
      },
    }),
    [handleColorPopoverOpen, handleColorPopoverClose],
  );
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
                  onChange={(value) =>
                    setDraft((prev) => {
                      const next: BoardThemeSettings = {
                        ...prev,
                        selectedTheme: {
                          ...prev.selectedTheme,
                          palette: {
                            ...prev.selectedTheme.palette,
                            [field.key]: value,
                          },
                        },
                      };
                      if (field.key === 'canvasBg') {
                        next.backgroundColor = value;
                      }
                      return next;
                    })
                  }
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
                  onChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      selectedTheme: {
                        ...prev.selectedTheme,
                        palette: {
                          ...prev.selectedTheme.palette,
                          [field.key]: value,
                        },
                      },
                    }))
                  }
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
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        selectedTheme: {
                          ...prev.selectedTheme,
                          palette: {
                            ...prev.selectedTheme.palette,
                            [field.key]: value,
                          },
                        },
                      }))
                    }
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
                  onChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      selectedTheme: {
                        ...prev.selectedTheme,
                        palette: {
                          ...prev.selectedTheme.palette,
                          [field.key]: value,
                        },
                      },
                    }))
                  }
                  {...sharedColorInputProps}
                />
              ))}
            </Stack>
          </Stack>

          <Stack gap="md" className="board-theme-editor-modal__preview-column">
            <Text className="board-theme-editor-modal__section-title">PREVIEW</Text>
            <Text fw={600} size="sm" c="dimmed">
              Board View
            </Text>
            <Box className="board-theme-editor-modal__board-preview" style={{ backgroundColor: previewPalette.canvasBg }}>
              <Box className="board-theme-editor-modal__board-preview-nav" style={{ backgroundColor: previewPalette.navbarBg }}>
                <Group justify="space-between" align="center" wrap="nowrap" gap="xs" px={6} w="100%">
                  <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
                    <IconArrowLeft
                      size={18}
                      stroke={1.75}
                      aria-hidden
                      style={{ color: previewPalette.navbarBorder, flexShrink: 0 }}
                    />
                    <IconLayoutKanbanFilled
                      size={18}
                      aria-hidden
                      style={{ color: previewPalette.navbarBorder, flexShrink: 0 }}
                    />
                    <Text
                      fw={700}
                      size="xs"
                      tt="uppercase"
                      lineClamp={1}
                      style={{ color: previewDerivedText.navFg, letterSpacing: '0.04em' }}
                    >
                      {PREVIEW_BOARD_TITLE}
                    </Text>
                  </Group>
                  <Group gap={6} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
                    <IconSettings
                      size={18}
                      stroke={1.9}
                      aria-hidden
                      style={{ color: previewPalette.navbarBorder }}
                    />
                    <Group gap={6} wrap="nowrap" align="center">
                      <Box
                        className="board-theme-editor-modal__board-preview-avatar"
                        style={{
                          backgroundColor: previewPalette.navbarBorder,
                          color: previewPalette.navbarBg,
                        }}
                      >
                        <Text size="xs" fw={700} lh={1}>
                          A
                        </Text>
                      </Box>
                      <Text size="xs" fw={500} lineClamp={1} style={{ color: previewPalette.navbarBorder, maxWidth: 72 }}>
                        {PREVIEW_USER_NAME}
                      </Text>
                    </Group>
                  </Group>
                </Group>
              </Box>
              <Box
                className="board-theme-editor-modal__board-preview-body"
                style={
                  {
                    scrollbarColor: `${previewScrollbar.thumb} ${previewScrollbar.track}`,
                    '--board-preview-scrollbar-thumb': previewScrollbar.thumb,
                    '--board-preview-scrollbar-track': previewScrollbar.track,
                  } as CSSProperties
                }
              >
                <Group
                  gap="xs"
                  wrap="nowrap"
                  className="board-theme-editor-modal__board-preview-columns"
                  style={{ width: 'max-content', minWidth: 520 }}
                  align="flex-start"
                >
                  <Box
                    className="board-theme-editor-modal__board-preview-list"
                    style={{
                      backgroundColor: previewPalette.listBg,
                      color: previewPalette.listHeaderText,
                      boxShadow: previewPalette.listShadow,
                    }}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap" gap={6} mb={6}>
                      <Text fw={700} size="xs" style={{ color: previewPalette.listHeaderText }}>
                        In Progress
                      </Text>
                      <Text size="xs" style={{ color: previewPalette.listMuted }}>
                        3
                      </Text>
                    </Group>
                    <Box
                      className="board-theme-editor-modal__list-preview-scroll"
                      style={
                        {
                          scrollbarColor: `${previewScrollbar.thumb} ${previewScrollbar.track}`,
                          '--board-preview-scrollbar-thumb': previewScrollbar.thumb,
                          '--board-preview-scrollbar-track': previewScrollbar.track,
                        } as CSSProperties
                      }
                    >
                      {Array.from({ length: 6 }, (_, i) => (
                        <Box
                          key={i}
                          className="board-theme-editor-modal__board-preview-card"
                          style={{
                            background: previewPalette.listControlHoverBg,
                          }}
                        />
                      ))}
                    </Box>
                    <Text size="xs" mt={8} style={{ color: previewPalette.listMutedStrong }}>
                      Add a card
                    </Text>
                  </Box>
                  <Box
                    className="board-theme-editor-modal__board-preview-list"
                    style={{
                      backgroundColor: previewPalette.listBg,
                      color: previewPalette.listHeaderText,
                      boxShadow: previewPalette.listShadow,
                    }}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap" gap={6} mb={6}>
                      <Text fw={700} size="xs" style={{ color: previewPalette.listHeaderText }}>
                        Done
                      </Text>
                      <Text size="xs" style={{ color: previewPalette.listMuted }}>
                        0
                      </Text>
                    </Group>
                    <Box
                      className="board-theme-editor-modal__board-preview-card"
                      style={{
                        background: previewPalette.listControlHoverBg,
                      }}
                    />
                  </Box>
                  <Stack gap={6} align="center" className="board-theme-editor-modal__board-preview-add-list">
                    <Text size="xs" fw={700} style={{ color: previewPalette.listHeaderText }}>
                      Add list
                    </Text>
                    <Box
                      px={8}
                      py={5}
                      style={{
                        backgroundColor: previewPalette.addListBg,
                        borderRadius: 8,
                        width: '100%',
                      }}
                    >
                      <Text size="xs" ta="center" style={{ color: previewPalette.listHeaderText }}>
                        Idle
                      </Text>
                    </Box>
                    <Box
                      px={8}
                      py={5}
                      style={{
                        backgroundColor: previewPalette.addListBgHover,
                        borderRadius: 8,
                        width: '100%',
                      }}
                    >
                      <Text size="xs" ta="center" style={{ color: previewPalette.listHeaderText }}>
                        Hover
                      </Text>
                    </Box>
                  </Stack>
                </Group>
              </Box>
            </Box>

            <Text fw={600} size="sm" c="dimmed">
              Card Detail Window
            </Text>
            <Box className="board-theme-editor-modal__card-preview" style={{ backgroundColor: previewPalette.cardDetailBg }}>
              <Group justify="space-between" mb="xs" wrap="nowrap" gap="xs" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    size="xs"
                    fw={700}
                    tt="uppercase"
                    style={{ color: previewPalette.cardDetailText, letterSpacing: '0.06em' }}
                  >
                    Description
                  </Text>
                  <Text fw={700} size="sm" lineClamp={2} style={{ color: previewDerivedText.cardDetailTitle }}>
                    Example card title
                  </Text>
                </Stack>
                <Box
                  className="board-theme-editor-modal__card-preview-close"
                  style={{
                    backgroundColor: previewPalette.cardDetailButtonBg,
                    color: previewPalette.cardDetailButtonText,
                  }}
                >
                  ×
                </Box>
              </Group>
              <Text size="sm" lh={1.45} style={{ color: previewDerivedText.cardDetailProse }}>
                {CARD_DETAIL_PREVIEW_LOREM}
              </Text>
              <Group gap="xs" mt="md">
                <Button
                  size="xs"
                  variant="filled"
                  styles={{
                    root: {
                      backgroundColor: previewPalette.cardDetailButtonBg,
                      color: previewPalette.cardDetailButtonText,
                    },
                  }}
                >
                  Action
                </Button>
                <Button
                  size="xs"
                  variant="filled"
                  styles={{
                    root: {
                      backgroundColor: previewPalette.cardDetailButtonHoverBg,
                      color: previewPalette.cardDetailButtonHoverText,
                    },
                  }}
                >
                  Hover
                </Button>
              </Group>
            </Box>
          </Stack>
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

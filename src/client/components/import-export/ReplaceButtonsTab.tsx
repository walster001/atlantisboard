import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  ColorInput,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import type {
  InlineButtonIconReplacement,
  InlineButtonImportColorOverrides,
  WekanLegacyInlineButtonCandidate,
} from '../../../shared/import/importPreflight.js';
import { extractWekanLegacyInlineButtonColorsFromHtml } from '../../../shared/import/wekanLegacyInlineHtml.js';
import { readImageAsDataUrl } from '../../utils/readImageAsDataUrl.js';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import { loginBrandingColorInputProps } from '../../constants/loginBrandingColorInputProps.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../../constants/iosModalSafeArea.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';

interface ReplaceButtonsTabProps {
  readonly buttons: readonly WekanLegacyInlineButtonCandidate[];
  readonly replacements: readonly InlineButtonIconReplacement[];
  readonly onChangeReplacements: (next: readonly InlineButtonIconReplacement[]) => void;
  readonly colorOverrides: InlineButtonImportColorOverrides;
  readonly onChangeColorOverrides: (next: InlineButtonImportColorOverrides) => void;
}

type ColourField = 'textColor' | 'bgColor';

const DEFAULT_PREVIEW_TEXT = '#579DFF';
const DEFAULT_PREVIEW_BG = '#1D2125';

function uniqueByIconSrc(
  buttons: readonly WekanLegacyInlineButtonCandidate[],
): readonly WekanLegacyInlineButtonCandidate[] {
  const seen = new Set<string>();
  const out: WekanLegacyInlineButtonCandidate[] = [];
  for (const b of buttons) {
    const key = b.iconSrc.trim();
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(b);
  }
  return out;
}

function resolveImportDefaultLabel(
  buttons: readonly WekanLegacyInlineButtonCandidate[],
  field: ColourField,
): string {
  const values = new Set<string>();
  for (const button of buttons) {
    const value = extractWekanLegacyInlineButtonColorsFromHtml(button.originalHtml)[field];
    if (value != null && value.trim() !== '') {
      values.add(value.trim());
    }
  }
  if (values.size === 1) {
    return [...values][0] ?? 'Use import default';
  }
  if (values.size > 1) {
    return 'Varies by button';
  }
  return 'Use import default';
}

function upsertReplacement(
  replacements: readonly InlineButtonIconReplacement[],
  iconSrc: string,
  replacementDataUrl: string,
): readonly InlineButtonIconReplacement[] {
  const filtered = replacements.filter((r) => r.iconSrc !== iconSrc);
  const trimmed = replacementDataUrl.trim();
  if (trimmed === '') {
    return filtered;
  }
  return [...filtered, { iconSrc, replacementDataUrl: trimmed }];
}

function isImportDefaultHexLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed.startsWith('#') && trimmed.length <= 80;
}

function colourPreviewSwatch(hex: string): ReactNode {
  return (
    <Box
      aria-hidden
      style={{
        width: 'var(--ci-preview-size)',
        height: 'var(--ci-preview-size)',
        borderRadius: '50%',
        border: '1px solid var(--mantine-color-gray-4)',
        backgroundColor: hex,
        flexShrink: 0,
      }}
    />
  );
}

function noColourSwatch(): ReactNode {
  return (
    <Box
      aria-hidden
      style={{
        width: 'var(--ci-preview-size)',
        height: 'var(--ci-preview-size)',
        borderRadius: '50%',
        border: '1px solid var(--mantine-color-gray-4)',
        background: 'repeating-linear-gradient(45deg, #f1f3f5 0 4px, #e9ecef 4px 8px)',
        flexShrink: 0,
      }}
    />
  );
}

function resolveColourInputDisplay(
  override: string | undefined,
  importDefaultLabel: string,
): { readonly value: string; readonly leftSection: ReactNode } {
  const trimmedOverride = override?.trim() ?? '';
  if (trimmedOverride !== '') {
    return { value: trimmedOverride, leftSection: colourPreviewSwatch(trimmedOverride) };
  }
  if (isImportDefaultHexLabel(importDefaultLabel)) {
    return { value: '', leftSection: colourPreviewSwatch(importDefaultLabel.trim()) };
  }
  return { value: '', leftSection: noColourSwatch() };
}

export const ReplaceButtonsTab = memo(function ReplaceButtonsTab({
  buttons,
  replacements,
  onChangeReplacements,
  colorOverrides,
  onChangeColorOverrides,
}: ReplaceButtonsTabProps) {
  const uniqueButtons = useMemo(() => uniqueByIconSrc(buttons), [buttons]);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const responsiveTier = useResponsiveTier();
  const colourModalFullScreen = responsiveTier === 'mobile';

  const [colourModalField, setColourModalField] = useState<ColourField | null>(null);
  const [pickerDraftHex, setPickerDraftHex] = useState(() =>
    normalizePresetHex(DEFAULT_PREVIEW_TEXT, BOARD_PRESET_COLOURS),
  );
  const [pickerDraftUseImportDefault, setPickerDraftUseImportDefault] = useState(true);

  const replacementByIcon = useMemo(() => {
    const map = new Map<string, InlineButtonIconReplacement>();
    for (const item of replacements) {
      map.set(item.iconSrc, item);
    }
    return map;
  }, [replacements]);

  const textImportDefaultLabel = useMemo(
    () => resolveImportDefaultLabel(uniqueButtons, 'textColor'),
    [uniqueButtons],
  );
  const bgImportDefaultLabel = useMemo(
    () => resolveImportDefaultLabel(uniqueButtons, 'bgColor'),
    [uniqueButtons],
  );
  const textColourInputDisplay = useMemo(
    () => resolveColourInputDisplay(colorOverrides.textColor, textImportDefaultLabel),
    [colorOverrides.textColor, textImportDefaultLabel],
  );
  const bgColourInputDisplay = useMemo(
    () => resolveColourInputDisplay(colorOverrides.bgColor, bgImportDefaultLabel),
    [colorOverrides.bgColor, bgImportDefaultLabel],
  );

  const openColourModal = useCallback(
    (field: ColourField): void => {
      const current = colorOverrides[field]?.trim() ?? '';
      const importFallback =
        field === 'textColor' ? DEFAULT_PREVIEW_TEXT : DEFAULT_PREVIEW_BG;
      setPickerDraftHex(
        normalizePresetHex(current || importFallback, BOARD_PRESET_COLOURS),
      );
      setPickerDraftUseImportDefault(current === '');
      setColourModalField(field);
    },
    [colorOverrides],
  );

  const handlePick = useCallback(
    async (iconSrc: string, file: File): Promise<void> => {
      const dataUrl = await readImageAsDataUrl(file);
      onChangeReplacements(upsertReplacement(replacements, iconSrc, dataUrl));
    },
    [onChangeReplacements, replacements],
  );

  const saveColourModal = useCallback((): void => {
    if (colourModalField == null) {
      return;
    }
    const textColor =
      colourModalField === 'textColor'
        ? pickerDraftUseImportDefault
          ? undefined
          : pickerDraftHex.trim()
        : colorOverrides.textColor?.trim();
    const bgColor =
      colourModalField === 'bgColor'
        ? pickerDraftUseImportDefault
          ? undefined
          : pickerDraftHex.trim()
        : colorOverrides.bgColor?.trim();
    const next: InlineButtonImportColorOverrides = {
      ...(textColor != null && textColor !== '' ? { textColor } : {}),
      ...(bgColor != null && bgColor !== '' ? { bgColor } : {}),
    };
    onChangeColorOverrides(next);
    setColourModalField(null);
  }, [
    colorOverrides,
    colourModalField,
    onChangeColorOverrides,
    pickerDraftHex,
    pickerDraftUseImportDefault,
  ]);

  if (uniqueButtons.length === 0) {
    return (
      <Alert color="green" radius="md">
        No legacy inline buttons detected in this Wekan file.
      </Alert>
    );
  }

  const colourModalTitle =
    colourModalField === 'textColor'
      ? 'Text colour for all imported buttons'
      : colourModalField === 'bgColor'
        ? 'Background colour for all imported buttons'
        : '';

  return (
    <Stack gap="md">
      <Alert color="blue" radius="md">
        Found {uniqueButtons.length} unique legacy inline button icon reference(s). Upload replacement icons
        per button below. Text and background colours apply to every legacy button on this import; leave them
        unset to keep each button&apos;s Wekan styles.
      </Alert>

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Button colours (all buttons)
          </Text>
          <Group grow align="flex-end" wrap="wrap">
            <ColorInput
              label="Text colour"
              placeholder={textImportDefaultLabel}
              disallowInput
              fixOnBlur={false}
              {...loginBrandingColorInputProps}
              withEyeDropper
              popoverProps={{ opened: false }}
              value={textColourInputDisplay.value}
              onChange={() => undefined}
              leftSection={textColourInputDisplay.leftSection}
              onClick={() => openColourModal('textColor')}
              styles={{ input: { cursor: 'pointer' } }}
            />
            <ColorInput
              label="Background colour"
              placeholder={bgImportDefaultLabel}
              disallowInput
              fixOnBlur={false}
              {...loginBrandingColorInputProps}
              withEyeDropper
              popoverProps={{ opened: false }}
              value={bgColourInputDisplay.value}
              onChange={() => undefined}
              leftSection={bgColourInputDisplay.leftSection}
              onClick={() => openColourModal('bgColor')}
              styles={{ input: { cursor: 'pointer' } }}
            />
          </Group>
        </Stack>
      </Paper>

      {uniqueButtons.map((button) => {
        const replacement = replacementByIcon.get(button.iconSrc);
        const importColors = extractWekanLegacyInlineButtonColorsFromHtml(button.originalHtml);
        const previewTextColor =
          colorOverrides.textColor?.trim() || importColors.textColor || DEFAULT_PREVIEW_TEXT;
        const previewBgColor =
          colorOverrides.bgColor?.trim() || importColors.bgColor || DEFAULT_PREVIEW_BG;

        return (
          <Paper key={button.iconSrc} withBorder radius="md" p="md">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Preview
              </Text>
              <Group gap="xs">
                <Button
                  component="a"
                  href={button.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                  variant="light"
                  styles={{
                    root: {
                      color: previewTextColor,
                      backgroundColor: previewBgColor,
                    },
                  }}
                  leftSection={
                    replacement?.replacementDataUrl ? (
                      <img
                        src={replacement.replacementDataUrl}
                        alt=""
                        width={16}
                        height={16}
                        style={{ borderRadius: 3, objectFit: 'cover' }}
                      />
                    ) : (
                      <ThemeIcon size={16} radius="sm" variant="light" color="gray">
                        <IconPhotoOff size={11} />
                      </ThemeIcon>
                    )
                  }
                >
                  {button.buttonText}
                </Button>
              </Group>

              <Text size="xs" c="dimmed">
                Original icon source:{' '}
                <Text component="span" inherit style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {button.iconSrc}
                </Text>
              </Text>
              {importColors.textColor != null || importColors.bgColor != null ? (
                <Text size="xs" c="dimmed">
                  Import colours:{' '}
                  {importColors.textColor != null ? `text ${importColors.textColor}` : ''}
                  {importColors.textColor != null && importColors.bgColor != null ? ', ' : ''}
                  {importColors.bgColor != null ? `background ${importColors.bgColor}` : ''}
                </Text>
              ) : null}
              {button.cardTitle ? (
                <Text size="xs" c="dimmed">
                  Example card: {button.cardTitle}
                </Text>
              ) : null}

              <input
                ref={(node) => {
                  fileRefs.current[button.iconSrc] = node;
                }}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void handlePick(button.iconSrc, f);
                }}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => {
                    fileRefs.current[button.iconSrc]?.click();
                  }}
                >
                  {replacement?.replacementDataUrl ? 'Change icon' : 'Upload replacement icon'}
                </Button>
                <Text size="xs" c={replacement?.replacementDataUrl ? 'green' : 'dimmed'}>
                  {replacement?.replacementDataUrl ? 'Uploaded' : 'Not uploaded'}
                </Text>
              </Group>
            </Stack>
          </Paper>
        );
      })}

      <Modal
        opened={colourModalField != null}
        onClose={() => setColourModalField(null)}
        title={colourModalTitle}
        centered={!colourModalFullScreen}
        size="lg"
        fullScreen={colourModalFullScreen}
        classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
        styles={modalStylesFullscreenSafeBody(colourModalFullScreen)}
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
              setPickerDraftUseImportDefault(false);
            }}
            onClearColor={() => setPickerDraftUseImportDefault(true)}
            noColorSelected={pickerDraftUseImportDefault}
            sectionLabel=""
          />
          <Group justify="flex-end" gap="sm" mt="md">
            <Button variant="default" radius="md" onClick={() => setColourModalField(null)}>
              Cancel
            </Button>
            <Button radius="md" onClick={saveColourModal}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
});

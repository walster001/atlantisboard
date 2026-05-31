import { memo, useMemo } from 'react';
import { Alert, ColorInput, Group, Paper, Stack, Text } from '@mantine/core';
import type {
  InlineButtonIconReplacement,
  InlineButtonImportColorOverrides,
  WekanLegacyInlineButtonCandidate,
} from '../../../shared/import/importPreflight.js';
import { loginBrandingColorInputProps } from '../../constants/loginBrandingColorInputProps.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { ReplaceButtonRow } from './ReplaceButtonRow.js';
import { ReplaceButtonsColourModal } from './ReplaceButtonsColourModal.js';
import { uniqueByIconSrc } from './replaceButtonsHelpers.js';
import { useReplaceButtonsColourModal } from './useReplaceButtonsColourModal.js';

interface ReplaceButtonsTabProps {
  readonly buttons: readonly WekanLegacyInlineButtonCandidate[];
  readonly replacements: readonly InlineButtonIconReplacement[];
  readonly onChangeReplacements: (next: readonly InlineButtonIconReplacement[]) => void;
  readonly colorOverrides: InlineButtonImportColorOverrides;
  readonly onChangeColorOverrides: (next: InlineButtonImportColorOverrides) => void;
}

export const ReplaceButtonsTab = memo(function ReplaceButtonsTab({
  buttons,
  replacements,
  onChangeReplacements,
  colorOverrides,
  onChangeColorOverrides,
}: ReplaceButtonsTabProps) {
  const uniqueButtons = useMemo(() => uniqueByIconSrc(buttons), [buttons]);
  const responsiveTier = useResponsiveTier();
  const colourModalFullScreen = responsiveTier === 'mobile';

  const replacementByIcon = useMemo(() => {
    const map = new Map<string, InlineButtonIconReplacement>();
    for (const item of replacements) {
      map.set(item.iconSrc, item);
    }
    return map;
  }, [replacements]);

  const colourModal = useReplaceButtonsColourModal(
    uniqueButtons,
    colorOverrides,
    onChangeColorOverrides,
  );

  if (uniqueButtons.length === 0) {
    return (
      <Alert color="green" radius="md">
        No legacy inline buttons detected in this Wekan file.
      </Alert>
    );
  }

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
              placeholder={colourModal.textImportDefaultLabel}
              disallowInput
              fixOnBlur={false}
              {...loginBrandingColorInputProps}
              withEyeDropper
              popoverProps={{ opened: false }}
              value={colourModal.textColourInputDisplay.value}
              onChange={() => undefined}
              leftSection={colourModal.textColourInputDisplay.leftSection}
              onClick={() => colourModal.openColourModal('textColor')}
              styles={{ input: { cursor: 'pointer' } }}
            />
            <ColorInput
              label="Background colour"
              placeholder={colourModal.bgImportDefaultLabel}
              disallowInput
              fixOnBlur={false}
              {...loginBrandingColorInputProps}
              withEyeDropper
              popoverProps={{ opened: false }}
              value={colourModal.bgColourInputDisplay.value}
              onChange={() => undefined}
              leftSection={colourModal.bgColourInputDisplay.leftSection}
              onClick={() => colourModal.openColourModal('bgColor')}
              styles={{ input: { cursor: 'pointer' } }}
            />
          </Group>
        </Stack>
      </Paper>

      {uniqueButtons.map((button) => (
        <ReplaceButtonRow
          key={button.iconSrc}
          button={button}
          replacement={replacementByIcon.get(button.iconSrc)}
          colorOverrides={colorOverrides}
          replacements={replacements}
          onChangeReplacements={onChangeReplacements}
        />
      ))}

      <ReplaceButtonsColourModal
        opened={colourModal.colourModalField != null}
        title={colourModal.colourModalTitle}
        fullScreen={colourModalFullScreen}
        pickerDraftHex={colourModal.pickerDraftHex}
        pickerDraftUseImportDefault={colourModal.pickerDraftUseImportDefault}
        onPickerDraftHexChange={(hex) => {
          colourModal.setPickerDraftHex(hex);
          colourModal.setPickerDraftUseImportDefault(false);
        }}
        onUseImportDefault={() => colourModal.setPickerDraftUseImportDefault(true)}
        onClose={colourModal.closeColourModal}
        onSave={colourModal.saveColourModal}
      />
    </Stack>
  );
});

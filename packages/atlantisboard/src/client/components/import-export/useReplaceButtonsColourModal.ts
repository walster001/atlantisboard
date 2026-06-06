import { useCallback, useMemo, useState } from 'react';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import type { InlineButtonImportColorOverrides } from '../../../shared/import/importPreflight.js';
import type { WekanLegacyInlineButtonCandidate } from '../../../shared/import/importPreflight.js';
import {
  buildColourOverridesFromModal,
  DEFAULT_PREVIEW_BG,
  DEFAULT_PREVIEW_TEXT,
  resolveColourInputDisplay,
  resolveImportDefaultLabel,
  type ColourField,
} from './replaceButtonsHelpers.js';

export function useReplaceButtonsColourModal(
  uniqueButtons: readonly WekanLegacyInlineButtonCandidate[],
  colorOverrides: InlineButtonImportColorOverrides,
  onChangeColorOverrides: (next: InlineButtonImportColorOverrides) => void,
) {
  const [colourModalField, setColourModalField] = useState<ColourField | null>(null);
  const [pickerDraftHex, setPickerDraftHex] = useState(() =>
    normalizePresetHex(DEFAULT_PREVIEW_TEXT, BOARD_PRESET_COLOURS),
  );
  const [pickerDraftUseImportDefault, setPickerDraftUseImportDefault] = useState(true);

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
      const importFallback = field === 'textColor' ? DEFAULT_PREVIEW_TEXT : DEFAULT_PREVIEW_BG;
      setPickerDraftHex(normalizePresetHex(current || importFallback, BOARD_PRESET_COLOURS));
      setPickerDraftUseImportDefault(current === '');
      setColourModalField(field);
    },
    [colorOverrides],
  );

  const closeColourModal = useCallback((): void => {
    setColourModalField(null);
  }, []);

  const saveColourModal = useCallback((): void => {
    if (colourModalField == null) {
      return;
    }
    onChangeColorOverrides(
      buildColourOverridesFromModal({
        colourModalField,
        pickerDraftUseImportDefault,
        pickerDraftHex,
        colorOverrides,
      }),
    );
    setColourModalField(null);
  }, [colorOverrides, colourModalField, onChangeColorOverrides, pickerDraftHex, pickerDraftUseImportDefault]);

  const colourModalTitle =
    colourModalField === 'textColor'
      ? 'Text colour for all imported buttons'
      : colourModalField === 'bgColor'
        ? 'Background colour for all imported buttons'
        : '';

  return {
    colourModalField,
    pickerDraftHex,
    setPickerDraftHex,
    pickerDraftUseImportDefault,
    setPickerDraftUseImportDefault,
    textImportDefaultLabel,
    bgImportDefaultLabel,
    textColourInputDisplay,
    bgColourInputDisplay,
    openColourModal,
    closeColourModal,
    saveColourModal,
    colourModalTitle,
  };
}

import type { ReactNode } from 'react';
import { Box } from '@mantine/core';
import type {
  InlineButtonIconReplacement,
  InlineButtonImportColorOverrides,
  WekanLegacyInlineButtonCandidate,
} from '../../../shared/import/importPreflight.js';
import { extractWekanLegacyInlineButtonColorsFromHtml } from '../../../shared/import/wekanLegacyInlineHtml.js';

export type ColourField = 'textColor' | 'bgColor';

export const DEFAULT_PREVIEW_TEXT = '#579DFF';
export const DEFAULT_PREVIEW_BG = '#1D2125';

export function uniqueByIconSrc(
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

export function resolveImportDefaultLabel(
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

export function upsertReplacement(
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

export function resolveColourInputDisplay(
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

export function buildColourOverridesFromModal(args: {
  readonly colourModalField: ColourField;
  readonly pickerDraftUseImportDefault: boolean;
  readonly pickerDraftHex: string;
  readonly colorOverrides: InlineButtonImportColorOverrides;
}): InlineButtonImportColorOverrides {
  const { colourModalField, pickerDraftUseImportDefault, pickerDraftHex, colorOverrides } = args;
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
  return {
    ...(textColor != null && textColor !== '' ? { textColor } : {}),
    ...(bgColor != null && bgColor !== '' ? { bgColor } : {}),
  };
}

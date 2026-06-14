import type { ButtonProps, CSSProperties, TextProps } from '@mantine/core';

/** Parse `getComputedStyle(...).color` / `.backgroundColor` into emoji-mart `r, g, b` triplets. */
export function parseCssColorToRgbTriplet(css: string): string | null {
  const trimmed = css.trim();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(trimmed);
  if (rgb != null) {
    return `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`;
  }
  return null;
}

/** Section header icons: align with board `--board-card-detail-text`. */
export const CARD_DETAIL_SECTION_ICON_COLOR = 'var(--board-card-detail-text, #868e96)';

/** Card detail modal shell (body/content/header in `CardDetailView`). */
export const CARD_DETAIL_MODAL_BACKGROUND_HEX = 'var(--board-card-detail-bg, #f8f9fb)';

/**
 * Fallback comma-separated RGB for emoji-mart `--rgb-background` when probes have not run yet.
 * Prefer values resolved from `--board-card-detail-bg` in `CardDescriptionEditorToolbar`.
 */
export const CARD_DETAIL_MODAL_BACKGROUND_RGB = '248, 249, 251';

/**
 * Section heading text and emoji-mart foreground fallback (see `parseCssColorToRgbTriplet`).
 */
export const CARD_DETAIL_SECTION_HEADING_HEX = 'var(--board-card-detail-text, #868e96)';

/** Fallback RGB for emoji-mart `--rgb-color` before CSS-var probes resolve. */
export const CARD_DETAIL_SECTION_HEADING_RGB = '134, 142, 150';

/** Emoji-mart `--rgb-input` → focused search field background in light theme (default sheet white). */
export const CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB = '255, 255, 255';

/** Section headers: icon + label (uses board card-detail text token). */
export const cardDetailSectionTitleProps: Partial<TextProps> = {
  size: 'sm',
  fw: 600,
  style: { color: 'var(--board-card-detail-text, #868e96)' },
};

/** Empty / helper lines under sections (same token, softened). */
export const cardDetailEmptyStateProps: Partial<TextProps> = {
  size: 'sm',
  fs: 'italic',
  style: { color: 'var(--board-card-detail-text, #868e96)', opacity: 0.72 },
};

/** Secondary hint without italics (e.g. short status lines). */
export const cardDetailMutedLineProps: Partial<TextProps> = {
  size: 'sm',
  style: { color: 'var(--board-card-detail-text, #868e96)', opacity: 0.78 },
};

/**
 * Pill actions matching board-style card detail (light grey fill, no outline, ~8px radius).
 */
export const cardDetailSoftButtonStyles: NonNullable<ButtonProps['styles']> = {
  root: {
    backgroundColor: 'var(--board-card-detail-button-bg, #f0f1f4)',
    border: 'none',
    color: 'var(--board-card-detail-button-text, var(--mantine-color-dark-7))',
    borderRadius: 8,
    paddingInline: 'var(--mantine-spacing-md)',
    fontWeight: 500,
    boxShadow: 'none',
    width: 'fit-content',
    maxWidth: '100%',
    '&:hover': {
      backgroundColor: 'var(--board-card-detail-button-hover-bg, #e4e6ea)',
      color: 'var(--board-card-detail-button-hover-text, var(--mantine-color-dark-7))',
    },
    '&:disabled': {
      backgroundColor: 'var(--board-card-detail-button-bg, #f0f1f4)',
      opacity: 0.55,
    },
  },
  label: { color: 'var(--board-card-detail-button-text, var(--mantine-color-dark-7))' },
  section: { color: 'var(--board-card-detail-button-text, var(--mantine-color-dark-7))' },
};

/** Attachment list row shell — uses board card-detail button colour. */
export const cardDetailAttachmentRowStyle: CSSProperties = {
  backgroundColor: 'var(--board-card-detail-button-bg, #f0f1f4)',
  borderRadius: 'var(--mantine-radius-md)',
};

/** Attachment filenames and primary labels. */
export const cardDetailAttachmentFilenameStyle: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--board-card-detail-text, #868e96)',
};

/** Secondary attachment metadata (size, date, scan hints). */
export const cardDetailAttachmentMetaProps: Partial<TextProps> = {
  size: 'xs',
  style: { color: 'var(--board-card-detail-text, #868e96)', opacity: 0.78 },
};

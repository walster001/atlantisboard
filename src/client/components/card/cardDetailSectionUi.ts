import type { ButtonProps, TextProps } from '@mantine/core';

/** Matches `cardDetailSectionTitleProps` (Mantine `gray.6`) for Tabler header icons. */
export const CARD_DETAIL_SECTION_ICON_COLOR = 'var(--mantine-color-gray-6)';

/** Card detail modal shell (body/content/header in `CardDetailView`). */
export const CARD_DETAIL_MODAL_BACKGROUND_HEX = 'var(--board-card-detail-bg, #f8f9fb)';

/**
 * Comma-separated RGB for emoji-mart `--rgb-background` (inherits into shadow DOM).
 * Must stay in sync with `CARD_DETAIL_MODAL_BACKGROUND_HEX`.
 */
export const CARD_DETAIL_MODAL_BACKGROUND_RGB = '248, 249, 251';

/**
 * Section heading text (`cardDetailSectionTitleProps` / `c: 'gray.6'`) and matching header icons.
 * Default Mantine `gray.6` is `#868e96`; if the theme overrides `gray`, update this to match index 6.
 */
export const CARD_DETAIL_SECTION_HEADING_HEX = 'var(--board-card-detail-text, #868e96)';

/**
 * Comma-separated RGB for emoji-mart `--rgb-color` (foreground: headings, search text, nav icons).
 * Matches section titles (`gray.6` / `#868e96`). Requires `theme="light"` on the picker when the shell
 * uses a light `--rgb-background`, or OS dark mode yields light text on a light panel.
 */
export const CARD_DETAIL_SECTION_HEADING_RGB = '134, 142, 150';

/** Emoji-mart `--rgb-input` → focused search field background in light theme (default sheet white). */
export const CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB = '255, 255, 255';

/** Section headers: icon + label (medium grey, semi-bold). */
export const cardDetailSectionTitleProps: Partial<TextProps> = {
  size: 'sm',
  fw: 600,
  c: 'gray.6',
};

/** Empty / helper lines under sections (light grey, italic). */
export const cardDetailEmptyStateProps: Partial<TextProps> = {
  size: 'sm',
  c: 'gray.5',
  fs: 'italic',
};

/** Secondary hint without italics (e.g. short status lines). */
export const cardDetailMutedLineProps: Partial<TextProps> = {
  size: 'sm',
  c: 'gray.5',
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

import type { CSSProperties } from 'react';
import type { BoardDB } from '../store/database.js';
import {
  BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
  boardThemePrefersNavbarLightForeground,
  createDefaultBoardThemeSettings,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemePalette,
  type BoardThemeSettings,
} from '../../shared/boardTheme.js';

function hexToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  if (color == null || typeof color !== 'string') {
    return null;
  }
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(color.trim());
  if (match == null) {
    return null;
  }
  const raw = match[1];
  const full =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw.length === 8 ? raw.slice(0, 6) : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return null;
  }
  return { r, g, b };
}

function relativeLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (rgb == null) {
    return 0;
  }
  const transform = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(rgb.r) + 0.7152 * transform(rgb.g) + 0.0722 * transform(rgb.b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function smartTextColor(bg: string | undefined, preferred: string | undefined): string {
  const safeBg = typeof bg === 'string' && bg.trim() !== '' ? bg.trim() : '#000000';
  const safePreferred = typeof preferred === 'string' && preferred.trim() !== '' ? preferred.trim() : '#1f2937';
  const light = '#ffffff';
  const dark = '#1f2937';
  if (contrastRatio(safePreferred, safeBg) >= 4.5) {
    return safePreferred;
  }
  return contrastRatio(light, safeBg) >= contrastRatio(dark, safeBg) ? light : dark;
}

/** Navbar labels/icons, card modal title, and description body — always contrast-tuned to their surfaces. */
export function getDerivedBoardTextColors(
  palette: BoardThemePalette,
  themeId?: string | undefined,
): {
  navFg: string;
  cardDetailTitle: string;
  cardDetailProse: string;
} {
  const navFg =
    themeId != null && boardThemePrefersNavbarLightForeground(themeId)
      ? '#ffffff'
      : smartTextColor(palette.navbarBg, '#ffffff');
  const titlePreferred = palette.cardDetailTitleText ?? '#1a1b1e';
  return {
    navFg,
    cardDetailTitle: smartTextColor(palette.cardDetailBg, titlePreferred),
    cardDetailProse: smartTextColor(palette.cardDetailBg, '#373a40'),
  };
}

/** Palette with the same intelligent-contrast text adjustments as the live board. */
export function applySmartContrastToThemePalette(
  palette: BoardThemePalette,
  smartContrast: boolean,
): BoardThemePalette {
  if (!smartContrast) {
    return { ...palette };
  }
  return {
    ...palette,
    listHeaderText: smartTextColor(palette.listBg, palette.listHeaderText),
    cardDetailTitleText: smartTextColor(palette.cardDetailBg, palette.cardDetailTitleText ?? '#1a1b1e'),
    cardDetailText: smartTextColor(palette.cardDetailBg, palette.cardDetailText),
    cardDetailButtonText: smartTextColor(palette.cardDetailButtonBg, palette.cardDetailButtonText),
    cardDetailButtonHoverText: smartTextColor(
      palette.cardDetailButtonHoverBg,
      palette.cardDetailButtonHoverText,
    ),
  };
}

function effectiveThemeSettings(board: BoardDB): BoardThemeSettings {
  const defaults = createDefaultBoardThemeSettings();
  return normalizeBoardThemeSettings(board.themeSettings ?? defaults, defaults);
}

/** Thumb + track for native board scrollbars — same rules as `getBoardPageThemeStyle` CSS vars. */
export function getBoardPaletteScrollbarColors(palette: BoardThemePalette): {
  readonly thumb: string;
  readonly track: string;
} {
  const scrollbarRaw =
    typeof palette.scrollbarColor === 'string' && palette.scrollbarColor.trim() !== ''
      ? palette.scrollbarColor.trim()
      : 'unset';
  const scrollbarUnset = scrollbarRaw.toLowerCase() === 'unset';
  return {
    thumb: scrollbarUnset ? palette.navbarBg : scrollbarRaw,
    track: BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
  };
}

export function getBoardPageThemeStyle(board: BoardDB): CSSProperties {
  const themeSettings = effectiveThemeSettings(board);
  const palette = applySmartContrastToThemePalette(
    themeSettings.selectedTheme.palette,
    themeSettings.smartContrast,
  );
  const bg = resolveBoardBackgroundFromThemeSettings(themeSettings);
  const isImage = bg != null && /^(https?:|data:|\/)/i.test(bg);
  const canvasBg = isImage ? palette.canvasBg : bg ?? palette.canvasBg;
  const imageScale = themeSettings.backgroundImageScale ?? 'fill';
  const imageSize = 'cover';
  const imageRepeat = 'no-repeat';
  const focalX = Math.max(0, Math.min(1, themeSettings.backgroundFocalX ?? 0.5));
  const focalY = Math.max(0, Math.min(1, themeSettings.backgroundFocalY ?? 0.5));
  const imagePosition =
    imageScale === 'fit-top-left'
      ? 'left top'
      : imageScale === 'smart-fill'
        ? `${Math.round(focalX * 100)}% ${Math.round(focalY * 100)}%`
        : 'center';
  const derived = getDerivedBoardTextColors(palette, themeSettings.selectedTheme.id);
  const sb = getBoardPaletteScrollbarColors(palette);
  return {
    '--board-nav-bg': palette.navbarBg,
    '--board-nav-fg': derived.navFg,
    '--board-nav-border': palette.navbarBorder,
    '--board-canvas-bg': canvasBg,
    '--board-list-bg': palette.listBg,
    '--board-list-header-text': palette.listHeaderText,
    '--board-list-muted': palette.listMuted,
    '--board-list-muted-strong': palette.listMutedStrong,
    '--board-list-control-hover-bg': palette.listControlHoverBg,
    '--board-list-shadow': palette.listShadow,
    '--board-add-list-bg': palette.addListBg,
    '--board-add-list-bg-hover': palette.addListBgHover,
    '--board-canvas-bg-image': isImage ? `url("${bg}")` : 'none',
    '--board-canvas-bg-image-size': imageSize,
    '--board-canvas-bg-image-repeat': imageRepeat,
    '--board-canvas-bg-image-position': imagePosition,
    '--board-scrollbar-color': sb.thumb,
    '--board-scrollbar-track-color': sb.track,
    '--board-body-scrollbar-color': sb.thumb,
    '--board-body-scrollbar-track-color': sb.track,
    '--board-card-detail-bg': palette.cardDetailBg,
    '--board-card-detail-text': palette.cardDetailText,
    '--board-card-detail-button-bg': palette.cardDetailButtonBg,
    '--board-card-detail-button-text': palette.cardDetailButtonText,
    '--board-card-detail-button-hover-bg': palette.cardDetailButtonHoverBg,
    '--board-card-detail-button-hover-text': palette.cardDetailButtonHoverText,
    '--board-card-detail-title-text': derived.cardDetailTitle,
    '--board-card-detail-prose': derived.cardDetailProse,
  } as CSSProperties;
}

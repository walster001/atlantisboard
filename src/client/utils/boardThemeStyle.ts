import type { CSSProperties } from 'react';
import type { BoardDB } from '../store/database.js';
import {
  BOARD_SCROLLBAR_TRACK_TRANSPARENT_HEXA,
  boardThemePrefersNavbarLightForeground,
  createDefaultBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemePalette,
  type BoardThemeSettings,
} from '../../shared/boardTheme.js';

const RGB_CACHE = new Map<string, { r: number; g: number; b: number } | null>();
const LUMINANCE_CACHE = new Map<string, number>();
const SMART_TEXT_CACHE = new Map<string, string>();
const BOARD_THEME_STYLE_CACHE = new Map<string, CSSProperties>();

const BOARD_THEME_STYLE_CACHE_MAX = 128;
const COLOR_CACHE_MAX = 512;

const PALETTE_SIGNATURE_KEYS: ReadonlyArray<keyof BoardThemePalette> = [
  'navbarBg',
  'navbarBorder',
  'canvasBg',
  'listBg',
  'listHeaderText',
  'listMuted',
  'listMutedStrong',
  'listControlHoverBg',
  'listShadow',
  'addListBg',
  'addListBgHover',
  'cardDetailBg',
  'cardDetailTitleText',
  'cardDetailText',
  'cardDetailButtonBg',
  'cardDetailButtonText',
  'cardDetailButtonHoverBg',
  'cardDetailButtonHoverText',
  'scrollbarColor',
  'scrollbarTrackColor',
];

function setCacheValue<K, V>(cache: Map<K, V>, key: K, value: V, max: number): V {
  if (cache.size >= max) {
    cache.clear();
  }
  cache.set(key, value);
  return value;
}

function hexToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  if (color == null || typeof color !== 'string') {
    return null;
  }
  const key = color.trim().toLowerCase();
  const cached = RGB_CACHE.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(key);
  if (match == null) {
    return setCacheValue(RGB_CACHE, key, null, COLOR_CACHE_MAX);
  }
  const raw = match[1];
  const full =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw.length === 8 ? raw.slice(0, 6) : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return setCacheValue(RGB_CACHE, key, null, COLOR_CACHE_MAX);
  }
  return setCacheValue(RGB_CACHE, key, { r, g, b }, COLOR_CACHE_MAX);
}

function relativeLuminance(color: string): number {
  const key = color.trim().toLowerCase();
  const cached = LUMINANCE_CACHE.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const rgb = hexToRgb(key);
  if (rgb == null) {
    return 0;
  }
  const transform = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const value = 0.2126 * transform(rgb.r) + 0.7152 * transform(rgb.g) + 0.0722 * transform(rgb.b);
  return setCacheValue(LUMINANCE_CACHE, key, value, COLOR_CACHE_MAX);
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
  const cacheKey = `${safeBg.toLowerCase()}|${safePreferred.toLowerCase()}`;
  const cached = SMART_TEXT_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const light = '#ffffff';
  const dark = '#1f2937';
  if (contrastRatio(safePreferred, safeBg) >= 4.5) {
    return setCacheValue(SMART_TEXT_CACHE, cacheKey, safePreferred, COLOR_CACHE_MAX);
  }
  const value = contrastRatio(light, safeBg) >= contrastRatio(dark, safeBg) ? light : dark;
  return setCacheValue(SMART_TEXT_CACHE, cacheKey, value, COLOR_CACHE_MAX);
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
  return board.themeSettings ?? createDefaultBoardThemeSettings();
}

function boardThemeStyleSignature(
  themeSettings: BoardThemeSettings,
  palette: BoardThemePalette,
  resolvedBackground: string,
): string {
  const palettePart = PALETTE_SIGNATURE_KEYS.map((key) => palette[key]).join('|');
  return [
    themeSettings.selectedTheme.id,
    themeSettings.smartContrast ? '1' : '0',
    themeSettings.backgroundMode,
    resolvedBackground,
    themeSettings.backgroundImageScale ?? 'fill',
    (themeSettings.backgroundFocalX ?? 0.5).toFixed(3),
    (themeSettings.backgroundFocalY ?? 0.5).toFixed(3),
    (themeSettings.boardOpacity ?? 0.8).toFixed(3),
    palettePart,
  ].join('||');
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
  const boardOpacity =
    typeof themeSettings.boardOpacity === 'number' && Number.isFinite(themeSettings.boardOpacity)
      ? Math.max(0.1, Math.min(1, themeSettings.boardOpacity))
      : 0.8;
  const surfaceAlpha = isImage ? boardOpacity : 1;
  const surfaceOpacityPct = `${Math.round(Math.max(0, Math.min(1, surfaceAlpha)) * 100)}%`;
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
  const signature = boardThemeStyleSignature(themeSettings, palette, canvasBg);
  const cachedStyle = BOARD_THEME_STYLE_CACHE.get(signature);
  if (cachedStyle != null) {
    return cachedStyle;
  }
  const style = {
    '--board-nav-bg': palette.navbarBg,
    '--board-nav-bg-opacity': String(surfaceAlpha),
    '--board-nav-fg': derived.navFg,
    '--board-nav-border': palette.navbarBorder,
    '--board-canvas-bg': canvasBg,
    '--board-list-bg': palette.listBg,
    '--board-list-bg-opacity': String(surfaceAlpha),
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
    '--board-surface-opacity-pct': surfaceOpacityPct,
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
  return setCacheValue(BOARD_THEME_STYLE_CACHE, signature, style, BOARD_THEME_STYLE_CACHE_MAX);
}

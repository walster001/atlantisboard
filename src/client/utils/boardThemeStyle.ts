import type { CSSProperties } from 'react';
import type { BoardDB } from '../store/database.js';
import {
  createDefaultBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeSettings,
} from '../../shared/boardTheme.js';

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (match == null) {
    return null;
  }
  const raw = match[1];
  const full =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw;
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

function smartTextColor(bg: string, preferred: string): string {
  const light = '#ffffff';
  const dark = '#1f2937';
  if (contrastRatio(preferred, bg) >= 4.5) {
    return preferred;
  }
  return contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;
}

function effectiveThemeSettings(board: BoardDB): BoardThemeSettings {
  return board.themeSettings ?? createDefaultBoardThemeSettings();
}

export function getBoardPageThemeStyle(board: BoardDB): CSSProperties {
  const themeSettings = effectiveThemeSettings(board);
  const palette = { ...themeSettings.selectedTheme.palette };
  if (themeSettings.smartContrast) {
    palette.listHeaderText = smartTextColor(palette.listBg, palette.listHeaderText);
    palette.cardDetailText = smartTextColor(palette.cardDetailBg, palette.cardDetailText);
    palette.cardDetailButtonText = smartTextColor(
      palette.cardDetailButtonBg,
      palette.cardDetailButtonText,
    );
    palette.cardDetailButtonHoverText = smartTextColor(
      palette.cardDetailButtonHoverBg,
      palette.cardDetailButtonHoverText,
    );
  }
  const bg = resolveBoardBackgroundFromThemeSettings(themeSettings);
  const isImage = bg != null && /^(https?:|data:|\/)/i.test(bg);
  const canvasBg = isImage ? palette.canvasBg : bg ?? palette.canvasBg;
  const imageScale = themeSettings.backgroundImageScale ?? 'fill';
  const imageSize = imageScale === 'stretch' ? '100% 100%' : imageScale === 'fit' ? 'contain' : 'cover';
  const imageRepeat = imageScale === 'stretch' ? 'no-repeat' : imageScale === 'fit' ? 'no-repeat' : 'no-repeat';
  return {
    '--board-nav-bg': palette.navbarBg,
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
    '--board-canvas-bg-image-position': 'center',
    '--board-scrollbar-color': palette.scrollbarColor,
    '--board-scrollbar-track-color': palette.scrollbarTrackColor,
    '--board-card-detail-bg': palette.cardDetailBg,
    '--board-card-detail-text': palette.cardDetailText,
    '--board-card-detail-button-bg': palette.cardDetailButtonBg,
    '--board-card-detail-button-text': palette.cardDetailButtonText,
    '--board-card-detail-button-hover-bg': palette.cardDetailButtonHoverBg,
    '--board-card-detail-button-hover-text': palette.cardDetailButtonHoverText,
  } as CSSProperties;
}

import type { CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import {
  BORDER_COLOR,
  extractWidthFromStyle,
  normalizeWidthPx,
} from './tiptapInlineButtonHelpers.js';
import { DEFAULT_AUDIO_CONTAINER_STYLE } from './tiptapAudioExtension.js';

export const AUDIO_LAYOUT_LIMITS = {
  minWidth: 240,
  maxWidth: 800,
  minHeight: 96,
  maxHeight: 480,
} as const;

/** Default block height for newly inserted audio players (width stays 100%). */
export const DEFAULT_AUDIO_INSERT_HEIGHT_PX = '120px';

export interface AudioLayoutPx {
  readonly widthPx: string | null;
  readonly heightPx: string | null;
}

export function extractHeightFromStyle(style: string): string | null {
  const match = style.match(/height:\s*([0-9.]+)px/i);
  return match?.[1] ?? null;
}

export function normalizeHeightPx(value: unknown): string | undefined {
  return normalizeWidthPx(value);
}

export function clampHeight(
  height: number,
  limits: { minHeight?: number; maxHeight?: number } = AUDIO_LAYOUT_LIMITS,
): number {
  const min = limits.minHeight !== undefined ? Math.max(0, limits.minHeight) : 0;
  let h = Math.max(min, height);
  if (limits.maxHeight !== undefined && h > limits.maxHeight) {
    h = limits.maxHeight;
  }
  return h;
}

export function readWidthPxFromAudioAttrs(attrs: Record<string, unknown>): string | null {
  const fromStyle =
    typeof attrs.containerStyle === 'string'
      ? normalizeWidthPx(extractWidthFromStyle(attrs.containerStyle) ?? undefined)
      : undefined;
  if (fromStyle != null) {
    return fromStyle;
  }
  return normalizeWidthPx(attrs.width) ?? null;
}

export function readHeightPxFromAudioAttrs(attrs: Record<string, unknown>): string | null {
  const fromStyle =
    typeof attrs.containerStyle === 'string'
      ? normalizeHeightPx(extractHeightFromStyle(attrs.containerStyle) ?? undefined)
      : undefined;
  if (fromStyle != null) {
    return fromStyle;
  }
  return normalizeHeightPx(attrs.height) ?? null;
}

export function readAudioLayoutFromAttrs(attrs: Record<string, unknown>): AudioLayoutPx {
  return {
    widthPx: readWidthPxFromAudioAttrs(attrs),
    heightPx: readHeightPxFromAudioAttrs(attrs),
  };
}

function dimensionDigitsFromPx(valuePx: string | null): string | null {
  if (valuePx == null) {
    return null;
  }
  const normalized = normalizeWidthPx(valuePx);
  if (normalized == null) {
    return null;
  }
  const digits = normalized.replace(/px$/i, '');
  return /^[0-9]+$/.test(digits) ? digits : null;
}

export function buildAudioContainerStyle(
  widthPx: string | null,
  heightPx: string | null,
  resizeActive: boolean,
): string {
  const widthPart = widthPx != null ? `width: ${widthPx};` : 'width: 100%;';
  const heightPart = heightPx != null ? `height: ${heightPx};` : '';
  const border = resizeActive ? `border: 1px dashed ${BORDER_COLOR};` : '';
  return `position: relative; ${widthPart} ${heightPart} max-width: 100%; box-sizing: border-box; ${border}`
    .replace(/\s+/g, ' ')
    .trim();
}

export function audioLayoutShellStyleFromPx(
  widthPx: string | null,
  heightPx: string | null,
  resizeActive: boolean,
): CSSProperties {
  return {
    position: 'relative',
    width: widthPx ?? '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    ...(heightPx != null
      ? {
          height: heightPx,
          minHeight: heightPx,
          ['--card-desc-audio-shell-h' as string]: heightPx,
        }
      : {}),
    ...(resizeActive ? { border: `1px dashed ${BORDER_COLOR}` } : {}),
  };
}

/** Imperative shell sizing for live resize (avoids React re-renders per pointermove). */
export function applyAudioLayoutShellToElement(
  element: HTMLElement,
  widthPx: string | null,
  heightPx: string | null,
  resizeActive: boolean,
): void {
  element.style.position = 'relative';
  element.style.width = widthPx ?? '100%';
  element.style.maxWidth = '100%';
  element.style.boxSizing = 'border-box';
  if (heightPx != null) {
    element.style.height = heightPx;
    element.style.minHeight = heightPx;
    element.style.setProperty('--card-desc-audio-shell-h', heightPx);
  } else {
    element.style.height = '';
    element.style.minHeight = '';
    element.style.removeProperty('--card-desc-audio-shell-h');
  }
  if (resizeActive) {
    element.style.border = `1px dashed ${BORDER_COLOR}`;
  } else {
    element.style.border = '';
  }
}

export function audioLayoutShellStyle(attrs: Record<string, unknown>): CSSProperties {
  const layout = readAudioLayoutFromAttrs(attrs);
  return audioLayoutShellStyleFromPx(layout.widthPx, layout.heightPx, false);
}

export function buildPersistedAudioLayoutAttrs(
  widthPx: string | null,
  heightPx: string | null,
): {
  width: string | null;
  height: string | null;
  containerStyle: string;
} {
  return {
    width: dimensionDigitsFromPx(widthPx),
    height: dimensionDigitsFromPx(heightPx),
    containerStyle: buildAudioContainerStyle(widthPx, heightPx, false),
  };
}

export function buildDefaultAudioInsertLayoutAttrs(): {
  width: string | null;
  height: string | null;
  containerStyle: string;
} {
  return buildPersistedAudioLayoutAttrs(null, DEFAULT_AUDIO_INSERT_HEIGHT_PX);
}

function hasExplicitAudioLayout(attrs: {
  width?: string | null;
  height?: string | null;
  containerStyle?: string;
}): boolean {
  if (attrs.width != null && String(attrs.width).trim() !== '') {
    return true;
  }
  if (attrs.height != null && String(attrs.height).trim() !== '') {
    return true;
  }
  const containerStyle = attrs.containerStyle?.trim() ?? '';
  return containerStyle !== '' && containerStyle !== DEFAULT_AUDIO_CONTAINER_STYLE;
}

/** Applies default insert height when attrs omit explicit layout (new toolbar insert). */
export function mergeDefaultAudioInsertLayout<
  T extends {
    width?: string | null;
    height?: string | null;
    containerStyle?: string;
  },
>(attrs: T): T & { width: string | null; height: string | null; containerStyle: string } {
  if (hasExplicitAudioLayout(attrs)) {
    return attrs as T & { width: string | null; height: string | null; containerStyle: string };
  }
  return {
    ...attrs,
    ...buildDefaultAudioInsertLayoutAttrs(),
  };
}

/** @deprecated Prefer {@link audioLayoutShellStyle} for React rendering. */
export function resolveAudioContainerStyle(attrs: Record<string, unknown>): string {
  const layout = readAudioLayoutFromAttrs(attrs);
  if (layout.widthPx != null || layout.heightPx != null) {
    return buildAudioContainerStyle(layout.widthPx, layout.heightPx, false);
  }
  const stored =
    typeof attrs.containerStyle === 'string' && attrs.containerStyle.trim() !== ''
      ? attrs.containerStyle.trim()
      : '';
  return stored !== '' ? stored : DEFAULT_AUDIO_CONTAINER_STYLE;
}

export function flushPendingCardDescriptionAudioLayouts(editor: Editor): void {
  const commits = editor.storage.audio?.pendingLayoutCommits;
  if (commits == null || commits.size === 0) {
    return;
  }
  for (const commit of commits) {
    commit();
  }
}

export function audioLayoutsEqual(a: AudioLayoutPx, b: AudioLayoutPx): boolean {
  return a.widthPx === b.widthPx && a.heightPx === b.heightPx;
}

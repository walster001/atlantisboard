import type { CSSProperties } from 'react';
import { getDotStyle } from './tiptapInlineButtonHelpers.js';

function parseDotStyle(index: number): CSSProperties {
  const raw = getDotStyle(index);
  const width = raw.match(/width:\s*([0-9.]+)px/)?.[1];
  const height = raw.match(/height:\s*([0-9.]+)px/)?.[1];
  const cursor = raw.match(/cursor:\s*([^;]+)/)?.[1]?.trim();
  const top = raw.includes('top:') ? raw.match(/top:\s*([^;]+)/)?.[1]?.trim() : undefined;
  const bottom = raw.includes('bottom:') ? raw.match(/bottom:\s*([^;]+)/)?.[1]?.trim() : undefined;
  const left = raw.includes('left:') ? raw.match(/left:\s*([^;]+)/)?.[1]?.trim() : undefined;
  const right = raw.includes('right:') ? raw.match(/right:\s*([^;]+)/)?.[1]?.trim() : undefined;
  return {
    position: 'absolute',
    width: width != null ? `${width}px` : undefined,
    height: height != null ? `${height}px` : undefined,
    border: `1.5px solid #6C6C6C`,
    borderRadius: '50%',
    ...(top != null ? { top } : {}),
    ...(bottom != null ? { bottom } : {}),
    ...(left != null ? { left } : {}),
    ...(right != null ? { right } : {}),
    ...(cursor != null ? { cursor } : {}),
  };
}

let cachedDotStyles: readonly CSSProperties[] | undefined;

/** Lazily built so importing this module in Node tests does not touch `document`. */
export function getCardDescriptionAudioResizeDotStyles(): readonly CSSProperties[] {
  if (cachedDotStyles === undefined) {
    cachedDotStyles = [0, 1, 2, 3].map(parseDotStyle);
  }
  return cachedDotStyles;
}

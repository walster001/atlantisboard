import type { CSSProperties } from 'react';

function isNearWhiteHexColor(value: string): boolean {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (match == null) {
    return false;
  }
  const rawHex = match[1];
  const hex =
    rawHex.length === 3
      ? `${rawHex[0]}${rawHex[0]}${rawHex[1]}${rawHex[1]}${rawHex[2]}${rawHex[2]}`
      : rawHex;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return false;
  }
  return r >= 240 && g >= 240 && b >= 240;
}

export interface HomeBoardTileCoverDisplay {
  readonly isImageBackground: boolean;
  readonly headerStyle: CSSProperties;
  readonly headerTextColor: string;
  readonly menuIconColor: string;
}

/** Home workspace board tile: header fill, image vs solid, and contrasting text/icon colours. */
export function resolveHomeBoardTileCoverDisplay(
  background: string | undefined,
): HomeBoardTileCoverDisplay {
  const rawBg = background?.trim() ?? '';
  const isImageBg = Boolean(rawBg && /^(https?:|\/|data:)/i.test(rawBg));
  const solidBg = rawBg && !isImageBg ? rawBg : null;
  const headerStyle: CSSProperties =
    solidBg != null
      ? { backgroundColor: solidBg }
      : isImageBg
        ? { backgroundImage: `url(${rawBg})` }
        : { backgroundColor: 'var(--mantine-color-blue-6)' };
  const headerTextColor = isNearWhiteHexColor(solidBg ?? '')
    ? 'var(--mantine-color-gray-7)'
    : '#ffffff';
  return {
    isImageBackground: isImageBg,
    headerStyle,
    headerTextColor,
    menuIconColor: headerTextColor,
  };
}

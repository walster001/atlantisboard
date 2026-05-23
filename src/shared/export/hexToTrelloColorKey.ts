import { trelloColorKeyToHex } from '../import/trelloLabelColors.js';

const TRELLO_PRESET_KEYS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
] as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (match == null) {
    return null;
  }
  const raw = match[1]!;
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

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/** Pick the closest Trello preset colour key for a hex label colour. */
export function hexToTrelloColorKey(hex: string): string {
  const rgb = hexToRgb(hex);
  if (rgb == null) {
    return 'blue';
  }
  let bestKey: string = 'blue';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of TRELLO_PRESET_KEYS) {
    const presetHex = trelloColorKeyToHex(key);
    const presetRgb = hexToRgb(presetHex);
    if (presetRgb == null) {
      continue;
    }
    const distance = colorDistance(rgb, presetRgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  }
  return bestKey;
}

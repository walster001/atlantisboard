/**
 * Trello (10) + Wekan hues — RGB scaled to ~0.79 of the original bright presets.
 * Shared by board cover, label, list, and inline colour pickers.
 */
export const BOARD_PRESET_COLOURS: readonly string[] = [
  '#4d953e',
  '#bfa900',
  '#c97e15',
  '#ba4737',
  '#9a5eb1',
  '#005f97',
  '#0099b1',
  '#40b778',
  '#c95fa0',
  '#29374e',
  '#8d8d8d',
  '#7d2b7e',
  '#881430',
  '#a6381e',
  '#b72309',
  '#b83b2f',
  '#c90077',
  '#005fa7',
  '#0095bf',
  '#008d75',
];

/** Map API/custom hex to preset casing so swatch selection matches (checkmark). */
export function normalizePresetHex(hex: string, presets: readonly string[]): string {
  const trimmed = hex.trim();
  const lower = trimmed.toLowerCase();
  const preset = presets.find((p) => p.toLowerCase() === lower);
  return preset ?? trimmed;
}

/** Readable icon on small preset swatches (WCAG-ish relative luminance). */
export function contrastIconColorForHex(hex: string): string {
  const s = hex.trim().replace('#', '');
  if (s.length !== 6) {
    return '#fff';
  }
  const r = Number.parseInt(s.slice(0, 2), 16);
  const g = Number.parseInt(s.slice(2, 4), 16);
  const b = Number.parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return '#fff';
  }
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return y > 0.62 ? '#111' : '#fff';
}

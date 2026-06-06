/**
 * Maps Trello label / cover colour keys (and null) to hex for BoardLabel and card labels.
 * Trello exports use lowercase preset names with optional _dark / _light suffixes.
 */

const TRELLO_COLOUR_HEX: Readonly<Record<string, string>> = {
  green: '#61BD4F',
  yellow: '#F2D600',
  orange: '#FF9F1A',
  red: '#EB5A46',
  purple: '#C377E0',
  blue: '#0079BF',
  sky: '#00C2E0',
  lime: '#51E898',
  pink: '#FF78CB',
  black: '#344563',
  green_dark: '#519839',
  yellow_dark: '#D9B51C',
  orange_dark: '#CD8313',
  red_dark: '#B04632',
  purple_dark: '#89609E',
  blue_dark: '#055A8C',
  sky_dark: '#00AECC',
  lime_dark: '#4ED583',
  pink_dark: '#DF4A97',
  black_dark: '#091E42',
  green_light: '#7BC86C',
  yellow_light: '#F5EA92',
  orange_light: '#FDBA63',
  red_light: '#EF7564',
  purple_light: '#CD8DE5',
  blue_light: '#5BA4CF',
  sky_light: '#29CCE5',
  lime_light: '#6DECA9',
  pink_light: '#FF8ED4',
  black_light: '#8993A4',
};

const DEFAULT_LABEL_HEX = '#61BD4F';

export function trelloColorKeyToHex(color: string | null | undefined): string {
  if (color == null || color === '') {
    return DEFAULT_LABEL_HEX;
  }
  const key = color.trim().toLowerCase();
  return TRELLO_COLOUR_HEX[key] ?? DEFAULT_LABEL_HEX;
}

/**
 * BoardLabel display name: max 50 chars per schema.
 * When Trello has no label text, use the colour preset key (e.g. sky, blue, green_light).
 */
export function trelloLabelDisplayName(name: string | undefined, colorKey: string | null | undefined): string {
  const n = name?.trim() ?? '';
  if (n.length > 0) {
    return n.length > 50 ? `${n.slice(0, 49)}…` : n;
  }
  const ck = (colorKey ?? '').trim().toLowerCase();
  if (ck.length > 0) {
    return ck.length > 50 ? `${ck.slice(0, 49)}…` : ck;
  }
  return 'Unnamed';
}

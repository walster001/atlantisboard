/**
 * Wekan UI label chip colours from upstream
 * `client/components/cards/labels.css` (`.card-label-*` background-color).
 * Import JSON stores the class suffix (e.g. `green`), not CSS keyword hex.
 *
 * @see https://github.com/wekan/wekan/blob/2325a5c5322357103af1794c3a0a499e78d8d142/client/components/cards/labels.css
 */
const WEKAN_CARD_LABEL_COLOURS: Readonly<Record<string, string>> = {
  white: '#FFFFFF',
  green: '#3CB500',
  yellow: '#FAD900',
  orange: '#FF9F19',
  red: '#EB4646',
  purple: '#A632DB',
  blue: '#0079BF',
  pink: '#FF78CB',
  sky: '#00C2E0',
  black: '#4D4D4D',
  lime: '#51E898',
  silver: '#C0C0C0',
  peachpuff: '#FFDAB9',
  crimson: '#DC143C',
  plum: '#DDA0DD',
  darkgreen: '#006400',
  slateblue: '#6A5ACD',
  magenta: '#FF00FF',
  gold: '#FFD700',
  navy: '#000080',
  gray: '#808080',
  saddlebrown: '#8B4513',
  paleturquoise: '#AFEEEE',
  mistyrose: '#FFE4E1',
  indigo: '#4B0082',
};

/**
 * Resolves a Wekan label colour token (`green`, `card-label-green`, etc.) to the
 * hex value Wekan’s UI uses for that chip. Returns undefined if unknown.
 */
export function wekanCardLabelColourToHex(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? '';
  if (raw === '') {
    return undefined;
  }
  let key = raw.toLowerCase();
  if (key.startsWith('card-label-')) {
    key = key.slice('card-label-'.length);
  }
  return WEKAN_CARD_LABEL_COLOURS[key];
}

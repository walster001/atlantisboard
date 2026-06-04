import { cssNamedColorToHex } from '../../../../shared/utils/cssNamedColorToHex.js';
import { wekanCardLabelColourToHex } from '../../../../shared/utils/wekanCardLabelPalette.js';

const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/;
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/;

export function normalizeImportedColour(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return undefined;
  }
  if (HEX_6_RE.test(trimmed)) {
    return trimmed;
  }
  if (HEX_3_RE.test(trimmed)) {
    const t = trimmed.slice(1);
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  const wekanHex = wekanCardLabelColourToHex(trimmed);
  if (wekanHex !== undefined) {
    return wekanHex;
  }
  return cssNamedColorToHex(trimmed);
}

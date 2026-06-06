const HEX_6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Card colour after import: keep a non-empty source value (e.g. Trello named
 * covers), otherwise apply an optional validated default hex.
 */
export function resolveImportedCardColour(
  importedColour: string | undefined,
  defaultHex: string | undefined,
): string | undefined {
  const trimmed = importedColour?.trim() ?? '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  const d = defaultHex?.trim() ?? '';
  if (d.length > 0 && HEX_6.test(d)) {
    return d;
  }
  return undefined;
}

/** Whether a string is a #RRGGBB card colour (CSV / explicit imports). */
export function isHexCardColour(value: string | undefined): boolean {
  const t = value?.trim() ?? '';
  return t.length > 0 && HEX_6.test(t);
}

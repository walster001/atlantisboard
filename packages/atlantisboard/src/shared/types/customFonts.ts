/**
 * Custom UI fonts stored in MinIO `fonts` bucket (flat keys). Public catalog for login branding selects.
 */
export interface PublicCustomFontEntry {
  readonly fileName: string;
  readonly displayName: string;
  /** Exact `font-family` stack saved in branding (e.g. `"Acme", sans-serif`). */
  readonly fontFamilyValue: string;
  /** API path to use in @font-face `url()` */
  readonly url: string;
}

export const SYSTEM_UI_FONT_FAMILY = 'system-ui, sans-serif' as const;

export function fontFamilyValueFromDisplayName(displayName: string): string {
  return `"${displayName.replace(/"/g, '').trim()}", sans-serif`;
}

/** Former bundled login branding stacks (no longer offered as options). */
const LEGACY_BRANDING_FONT_STACKS = new Set([
  'Manrope, sans-serif',
  'Inter, sans-serif',
  'Roboto, sans-serif',
  '"Open Sans", sans-serif',
  'Georgia, serif',
]);

export function stripLegacyBrandingFontStacks(family: string): string {
  const t = family.trim();
  if (LEGACY_BRANDING_FONT_STACKS.has(t)) {
    return SYSTEM_UI_FONT_FAMILY;
  }
  return family;
}

export function buildBrandingFontSelectData(
  customFonts: readonly PublicCustomFontEntry[]
): { value: string; label: string }[] {
  return [
    { value: SYSTEM_UI_FONT_FAMILY, label: 'System UI' },
    ...customFonts.map((f) => ({ value: f.fontFamilyValue, label: f.displayName })),
  ];
}

export function customFontFormatFromFileName(
  fileName: string
): 'woff2' | 'woff' | 'truetype' | 'opentype' {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'woff2') {
    return 'woff2';
  }
  if (ext === 'woff') {
    return 'woff';
  }
  if (ext === 'ttf') {
    return 'truetype';
  }
  return 'opentype';
}

/** Shared detection patterns for legacy Wekan inline-button HTML in card descriptions. */

export const LEGACY_WEKAN_INLINE_BUTTON_RES: readonly RegExp[] = [
  /<span[^>]*display\s*:\s*inline-flex[^>]*>\s*<img[^>]*src\s*=\s*(?:['"]|&quot;)?([^'"\s>]+)(?:['"]|&quot;)?[^>]*>\s*<a[^>]*href\s*=\s*(?:['"]|&quot;)?([^'"\s>]+)(?:['"]|&quot;)?[^>]*>([\s\S]*?)<\/a>\s*<\/span>/gi,
  /<(?:span|div)[^>]*display\s*:\s*inline-flex[^>]*>[\s\S]*?<a[^>]*href\s*=\s*(?:['"]|&quot;)?([^'"\s>]+)(?:['"]|&quot;)?[^>]*>[\s\S]*?<img[^>]*src\s*=\s*(?:['"]|&quot;)?([^'"\s>]+)(?:['"]|&quot;)?[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/(?:span|div)>/gi,
] as const;

export function decodeWekanHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function hasLegacyWekanInlineButtonHtml(value: string): boolean {
  const input = decodeWekanHtmlEntities(value);
  for (const re of LEGACY_WEKAN_INLINE_BUTTON_RES) {
    re.lastIndex = 0;
    if (re.test(input)) {
      return true;
    }
  }
  return false;
}

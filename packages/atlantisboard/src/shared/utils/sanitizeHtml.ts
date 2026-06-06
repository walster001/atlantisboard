import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
] as const;

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'] as const;

/**
 * Strict HTML sanitizer for untrusted rich text (imports, legacy card descriptions).
 * Strips scripts, event handlers, SVG, and other active content.
 */
export function sanitizeHtml(html: string): string {
  const trimmed = html.trim();
  if (trimmed === '') {
    return '';
  }

  return DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  }).trim();
}

/** Reject SVG uploads — SVG can embed script/event handlers even when served as image. */
export function isBlockedSvgUpload(mimeType: string, fileName?: string): boolean {
  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalizedMime === 'image/svg+xml') {
    return true;
  }
  if (fileName != null) {
    const base = fileName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
    return base.endsWith('.svg');
  }
  return false;
}

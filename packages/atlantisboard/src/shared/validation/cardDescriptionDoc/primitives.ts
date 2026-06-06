export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateHref(href: unknown): boolean {
  if (typeof href !== 'string' || href.length === 0 || href.length > 2048) {
    return false;
  }
  const t = href.trim();
  if (t.startsWith('http://')) {
    return false;
  }
  return (
    t.startsWith('https://') ||
    t.startsWith('/') ||
    t.startsWith('./') ||
    t.startsWith('../') ||
    t.startsWith('#') ||
    t.startsWith('mailto:')
  );
}

export function validateMediaSrc(src: unknown): boolean {
  if (typeof src !== 'string' || src.length === 0 || src.length > 4096) {
    return false;
  }
  const t = src.trim();
  return (
    t.startsWith('https://') ||
    t.startsWith('http://') ||
    t.startsWith('/') ||
    t.startsWith('./') ||
    t.startsWith('../')
  );
}

export function validateInlineButtonIconSrc(src: unknown): boolean {
  if (validateMediaSrc(src)) {
    return true;
  }
  if (typeof src !== 'string') {
    return false;
  }
  const t = src.trim();
  if (t.length === 0 || t.length > 200000) {
    return false;
  }
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/.test(t);
}

/** Allow only hex colors from the color picker / Tiptap (no arbitrary CSS). */
export function isAllowedTextStyleColor(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const s = value.trim();
  if (s.length === 0) {
    return false;
  }
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s);
}

/** Tiptap FontSize uses strings like `16px` — restrict to a safe integer px range. */
export function isAllowedTextStyleFontSize(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const m = /^([1-9]\d*)px$/.exec(value.trim());
  if (m == null) {
    return false;
  }
  const n = Number.parseInt(m[1], 10);
  return n >= 8 && n <= 200;
}

export function parsePositiveInt1To999999(raw: unknown): number | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return raw >= 1 && raw <= 999_999 ? raw : null;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(n) && n >= 1 && n <= 999_999 ? n : null;
  }
  return null;
}

export function parseHeadingLevel(raw: unknown): number | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return raw >= 1 && raw <= 6 ? raw : null;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
  }
  return null;
}

export function isAbsentOrEmptyLeafContent(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

export function isSafeLineHeightValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const t = value.trim();
  if (t === 'normal') {
    return true;
  }
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) {
    return false;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0.75 && n <= 3;
}

export function isSafeInlineStyleString(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length > 4096) {
    return false;
  }
  const lower = value.toLowerCase();
  if (
    lower.includes('javascript:') ||
    lower.includes('expression(') ||
    lower.includes('@import') ||
    lower.includes('<script')
  ) {
    return false;
  }
  return true;
}

export function validateTextStyleAttrs(attrs: Record<string, unknown>): boolean {
  // Only validate fields we render; ignore extra keys from paste / editor defaults so saves do not 400.
  if (!isAllowedTextStyleColor(attrs.color)) {
    return false;
  }
  if (!isAllowedTextStyleFontSize(attrs.fontSize)) {
    return false;
  }
  return true;
}

import { parseTwemojiSpriteCoord } from '../twemojiSpriteCoord.js';

const MAX_DEPTH = 64;

const ALLOWED_BLOCK_NODES = new Set<string>([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'imageResize',
  'video',
  'inlineButton',
  'twemojiEmoji',
]);

const ALLOWED_MARKS = new Set<string>([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'underline',
  'textStyle',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateHref(href: unknown): boolean {
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

function validateMediaSrc(src: unknown): boolean {
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

function validateInlineButtonIconSrc(src: unknown): boolean {
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
function isAllowedTextStyleColor(value: unknown): boolean {
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
function isAllowedTextStyleFontSize(value: unknown): boolean {
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

const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);

/** HTML `ol type` + TipTap defaults (`null`). */
const ORDERED_LIST_TYPE_VALUES = new Set(['1', 'a', 'A', 'i', 'I']);

function parsePositiveInt1To999999(raw: unknown): number | null {
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

function parseHeadingLevel(raw: unknown): number | null {
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

function isAbsentOrEmptyLeafContent(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function isSafeLineHeightValue(value: unknown): boolean {
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

function isSafeInlineStyleString(value: unknown): boolean {
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

function validateTextStyleAttrs(attrs: Record<string, unknown>): boolean {
  // Only validate fields we render; ignore extra keys from paste / editor defaults so saves do not 400.
  if (!isAllowedTextStyleColor(attrs.color)) {
    return false;
  }
  if (!isAllowedTextStyleFontSize(attrs.fontSize)) {
    return false;
  }
  return true;
}

function validateMark(mark: unknown): boolean {
  if (!isRecord(mark)) {
    return false;
  }
  const type = mark.type;
  if (typeof type !== 'string' || !ALLOWED_MARKS.has(type)) {
    return false;
  }
  if (type === 'link') {
    const attrs = mark.attrs;
    if (!isRecord(attrs)) {
      return false;
    }
    return validateHref(attrs.href);
  }
  if (type === 'textStyle') {
    const attrs = mark.attrs;
    if (attrs === undefined) {
      return true;
    }
    if (!isRecord(attrs)) {
      return false;
    }
    return validateTextStyleAttrs(attrs);
  }
  return true;
}

function validateMarks(marks: unknown): boolean {
  if (marks === undefined) {
    return true;
  }
  if (!Array.isArray(marks)) {
    return false;
  }
  return marks.every((m) => validateMark(m));
}

function validateNode(node: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) {
    return false;
  }
  if (!isRecord(node)) {
    return false;
  }
  const type = node.type;
  if (typeof type !== 'string') {
    return false;
  }

  if (type === 'text') {
    if (typeof node.text !== 'string') {
      return false;
    }
    return validateMarks(node.marks);
  }

  if (type === 'hardBreak') {
    const c = node.content;
    return c === undefined || c === null || (Array.isArray(c) && c.length === 0);
  }

  if (!ALLOWED_BLOCK_NODES.has(type)) {
    return false;
  }

  if (type === 'paragraph') {
    const attrs = node.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        return false;
      }
      for (const key of Object.keys(attrs)) {
        if (key === 'textAlign') {
          const ta = attrs.textAlign;
          if (ta != null && typeof ta === 'string' && !TEXT_ALIGN_VALUES.has(ta)) {
            return false;
          }
        } else if (key === 'lineHeight') {
          if (!isSafeLineHeightValue(attrs.lineHeight)) {
            return false;
          }
        }
        // Ignore unknown keys (imports / paste); only textAlign + lineHeight are rendered.
      }
    }
  }

  if (type === 'heading') {
    const attrs = node.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        return false;
      }
      for (const key of Object.keys(attrs)) {
        if (key === 'level') {
          const level = attrs.level;
          if (level !== undefined) {
            const n = parseHeadingLevel(level);
            if (n == null) {
              return false;
            }
          }
        } else if (key === 'textAlign') {
          const ta = attrs.textAlign;
          if (ta != null && typeof ta === 'string' && !TEXT_ALIGN_VALUES.has(ta)) {
            return false;
          }
        } else if (key === 'lineHeight') {
          if (!isSafeLineHeightValue(attrs.lineHeight)) {
            return false;
          }
        }
        // Ignore unknown keys (imports / paste).
      }
    }
  }

  if (type === 'orderedList') {
    const attrs = node.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        return false;
      }
      for (const key of Object.keys(attrs)) {
        if (key !== 'start' && key !== 'type') {
          return false;
        }
      }
      const start = attrs.start;
      if (start !== undefined) {
        if (parsePositiveInt1To999999(start) == null) {
          return false;
        }
      }
      const listType = attrs.type;
      if (listType !== undefined && listType !== null) {
        if (typeof listType !== 'string' || !ORDERED_LIST_TYPE_VALUES.has(listType)) {
          return false;
        }
      }
    }
  }

  if (type === 'codeBlock') {
    const attrs = node.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        return false;
      }
      const lang = attrs.language;
      if (lang !== undefined) {
        if (typeof lang !== 'string' || lang.length > 256) {
          return false;
        }
      }
    }
  }

  if (type === 'image' || type === 'imageResize' || type === 'video') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return false;
    }
    if (!validateMediaSrc(attrs.src)) {
      return false;
    }
    if (type === 'video') {
      const poster = attrs.poster;
      if (poster !== undefined && poster !== null && poster !== '') {
        if (typeof poster !== 'string' || !validateMediaSrc(poster)) {
          return false;
        }
      }
    }
    if (!isAbsentOrEmptyLeafContent(node.content)) {
      return false;
    }
    return true;
  }

  if (type === 'inlineButton') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return false;
    }
    if (!validateHref(attrs.href)) {
      return false;
    }
    const buttonText = attrs.buttonText;
    if (typeof buttonText !== 'string' || buttonText.length > 500) {
      return false;
    }
    if (!isAllowedTextStyleColor(attrs.textColor) || !isAllowedTextStyleColor(attrs.bgColor)) {
      return false;
    }
    const br = attrs.borderRadiusPx;
    if (
      typeof br !== 'number' ||
      !Number.isInteger(br) ||
      br < 0 ||
      br > 48
    ) {
      return false;
    }
    const isp = attrs.iconSizePx;
    if (
      typeof isp !== 'number' ||
      !Number.isInteger(isp) ||
      isp < 8 ||
      isp > 128
    ) {
      return false;
    }
    const iconSrc = attrs.iconSrc;
    if (iconSrc !== null && iconSrc !== undefined) {
      if (typeof iconSrc !== 'string' || !validateInlineButtonIconSrc(iconSrc)) {
        return false;
      }
    }
    const width = attrs.width;
    if (width !== null && width !== undefined) {
      if (typeof width !== 'string' || !/^[0-9]{1,4}$/.test(width.trim())) {
        return false;
      }
    }
    if (!isSafeInlineStyleString(attrs.containerStyle) || !isSafeInlineStyleString(attrs.wrapperStyle)) {
      return false;
    }
    const ox = attrs.offsetXPx;
    const oy = attrs.offsetYPx;
    if (ox !== undefined) {
      if (typeof ox !== 'number' || !Number.isInteger(ox) || ox < -800 || ox > 800) {
        return false;
      }
    }
    if (oy !== undefined) {
      if (typeof oy !== 'number' || !Number.isInteger(oy) || oy < -800 || oy > 800) {
        return false;
      }
    }
    if (!isAbsentOrEmptyLeafContent(node.content)) {
      return false;
    }
    return true;
  }

  if (type === 'twemojiEmoji') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return false;
    }
    if (typeof attrs.emoji !== 'string' || attrs.emoji.trim() === '') {
      return false;
    }
    if (!isAbsentOrEmptyLeafContent(node.content)) {
      return false;
    }
    const sx = parseTwemojiSpriteCoord(attrs.spriteX);
    const sy = parseTwemojiSpriteCoord(attrs.spriteY);
    const hasSprite =
      sx != null &&
      sy != null &&
      sx >= 0 &&
      sy >= 0 &&
      sx < 512 &&
      sy < 512;
    if (hasSprite) {
      return true;
    }
    if (!validateMediaSrc(attrs.src)) {
      return false;
    }
    return true;
  }

  const content = node.content;
  if (content === undefined) {
    // Tiptap can serialize empty blocks (for example a trailing paragraph) without `content`.
    // Treat those as valid so media-only / mixed-media descriptions do not get discarded.
    return type !== 'bulletList' && type !== 'orderedList' && type !== 'listItem';
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.every((child) => validateNode(child, depth + 1));
}

/** Validates Tiptap/ProseMirror JSON document shape and allowed node/mark types. */
export function isValidCardDescriptionDoc(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type !== 'doc') {
    return false;
  }
  const content = value.content;
  if (content === undefined) {
    return true;
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.every((n) => validateNode(n, 0));
}

export function isValidCardDescriptionJsonString(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  return isValidCardDescriptionDoc(parsed);
}

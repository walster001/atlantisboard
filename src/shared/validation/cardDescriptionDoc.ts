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
  return (
    t.startsWith('https://') ||
    t.startsWith('http://') ||
    t.startsWith('/') ||
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
  const allowedKeys = new Set(['color', 'fontSize']);
  for (const key of Object.keys(attrs)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
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
    return node.content === undefined;
  }

  if (!ALLOWED_BLOCK_NODES.has(type)) {
    return false;
  }

  if (type === 'heading') {
    const attrs = node.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        return false;
      }
      const level = attrs.level;
      if (level !== undefined) {
        if (typeof level !== 'number' || level < 1 || level > 6 || !Number.isInteger(level)) {
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
      if (lang !== undefined && typeof lang !== 'string') {
        return false;
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
    if (node.content !== undefined) {
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
      if (typeof iconSrc !== 'string' || !validateMediaSrc(iconSrc)) {
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
    if (node.content !== undefined) {
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
    if (node.content !== undefined) {
      return false;
    }
    const sx = attrs.spriteX;
    const sy = attrs.spriteY;
    const hasSprite =
      typeof sx === 'number' &&
      typeof sy === 'number' &&
      Number.isInteger(sx) &&
      Number.isInteger(sy) &&
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

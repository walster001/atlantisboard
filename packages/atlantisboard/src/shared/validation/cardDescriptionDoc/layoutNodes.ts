import {
  ORDERED_LIST_TYPE_VALUES,
  TEXT_ALIGN_VALUES,
} from './constants.js';
import {
  isRecord,
  isSafeLineHeightValue,
  parseHeadingLevel,
  parsePositiveInt1To999999,
} from './primitives.js';

export function validateParagraphAttrs(attrs: unknown): boolean {
  if (attrs === undefined) {
    return true;
  }
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
  return true;
}

export function validateHeadingAttrs(attrs: unknown): boolean {
  if (attrs === undefined) {
    return true;
  }
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
  return true;
}

export function validateOrderedListAttrs(attrs: unknown): boolean {
  if (attrs === undefined) {
    return true;
  }
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
  return true;
}

export function validateCodeBlockAttrs(attrs: unknown): boolean {
  if (attrs === undefined) {
    return true;
  }
  if (!isRecord(attrs)) {
    return false;
  }
  const lang = attrs.language;
  if (lang !== undefined) {
    if (typeof lang !== 'string' || lang.length > 256) {
      return false;
    }
  }
  return true;
}

import { ALLOWED_MARKS } from './constants.js';
import { isRecord, validateHref, validateTextStyleAttrs } from './primitives.js';

export function validateMark(mark: unknown): boolean {
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

export function validateMarks(marks: unknown): boolean {
  if (marks === undefined) {
    return true;
  }
  if (!Array.isArray(marks)) {
    return false;
  }
  return marks.every((m) => validateMark(m));
}

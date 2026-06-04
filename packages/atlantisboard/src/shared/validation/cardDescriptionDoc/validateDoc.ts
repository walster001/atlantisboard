import { isRecord } from './primitives.js';
import { validateNode } from './validateNode.js';

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

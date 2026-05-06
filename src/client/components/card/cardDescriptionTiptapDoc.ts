import type { JSONContent } from '@tiptap/core';

/**
 * ProseMirror rejects empty `text` nodes; older imports may still contain `text: ""`.
 * Normalizes those (and empty inline containers) so editors and static renderers load safely.
 */
export function repairCardDescriptionDocForPm(node: JSONContent, parentType?: string): JSONContent {
  if (node.type === 'text') {
    if (node.text === '') {
      if (parentType === 'codeBlock') {
        return { type: 'text', text: '\u200b' };
      }
      return { type: 'hardBreak' };
    }
    return node;
  }
  if (!Array.isArray(node.content)) {
    return node;
  }
  const repaired = node.content.map((child) => repairCardDescriptionDocForPm(child, node.type));
  if (node.type === 'paragraph' || node.type === 'heading') {
    if (repaired.length === 0) {
      return { ...node, content: [{ type: 'hardBreak' }] };
    }
  }
  if (node.type === 'codeBlock' && repaired.length === 0) {
    return { ...node, content: [{ type: 'text', text: '\u200b' }] };
  }
  return { ...node, content: repaired };
}

export function countHardBreaksInJson(node: JSONContent | undefined): number {
  if (node == null || typeof node !== 'object') {
    return 0;
  }
  let n = node.type === 'hardBreak' ? 1 : 0;
  if (Array.isArray(node.content)) {
    for (const c of node.content) {
      n += countHardBreaksInJson(c);
    }
  }
  return n;
}

/** Default empty doc: one paragraph with a single hardBreak (Tiptap placeholder shape). */
export function isSingleParagraphSingleHardBreakPlaceholder(doc: JSONContent): boolean {
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length !== 1) {
    return false;
  }
  const p = doc.content[0];
  if (p?.type !== 'paragraph' || !Array.isArray(p.content)) {
    return false;
  }
  return p.content.length === 1 && p.content[0]?.type === 'hardBreak';
}

export function hasNonTextRenderableContent(node: JSONContent | undefined): boolean {
  if (node == null || typeof node !== 'object') {
    return false;
  }
  if (
    node.type === 'image' ||
    node.type === 'imageResize' ||
    node.type === 'video' ||
    node.type === 'inlineButton' ||
    node.type === 'twemojiEmoji' ||
    node.type === 'horizontalRule'
  ) {
    return true;
  }
  const content = Array.isArray(node.content) ? node.content : [];
  return content.some((child) => hasNonTextRenderableContent(child));
}

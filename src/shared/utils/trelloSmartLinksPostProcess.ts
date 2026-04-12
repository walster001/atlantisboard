import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';
import {
  buildTrelloImportInlineButton,
  deriveTrelloSmartLinkButtonLabel,
  shouldTrelloLinkBecomeInlineButton,
} from './trelloImportInlineButton.js';

type JsonNode = Record<string, unknown>;

function isParagraphWithSingleLinkedText(block: JsonNode): boolean {
  if (block.type !== 'paragraph' || !Array.isArray(block.content) || block.content.length !== 1) {
    return false;
  }
  const only = block.content[0] as JsonNode;
  if (only.type !== 'text' || typeof only.text !== 'string') {
    return false;
  }
  const marks = only.marks;
  if (!Array.isArray(marks) || marks.length !== 1) {
    return false;
  }
  const m = marks[0] as JsonNode;
  return m.type === 'link' && m.attrs != null && typeof (m.attrs as JsonNode).href === 'string';
}

function paragraphToInlineButton(block: JsonNode): JsonNode | null {
  if (!isParagraphWithSingleLinkedText(block)) {
    return null;
  }
  const only = (block.content as JsonNode[])[0] as JsonNode;
  const marks = only.marks as JsonNode[];
  const linkAttrs = marks[0].attrs as JsonNode;
  const href = String(linkAttrs.href);
  const title =
    typeof linkAttrs.title === 'string' ? linkAttrs.title : '';
  if (!shouldTrelloLinkBecomeInlineButton(href, title)) {
    return null;
  }
  const btn = buildTrelloImportInlineButton(
    href,
    deriveTrelloSmartLinkButtonLabel(href, String(only.text)),
  );
  if (btn == null) {
    return null;
  }
  const asNode = btn as unknown as JsonNode;
  if (!isValidCardDescriptionDoc({ type: 'doc', content: [asNode] })) {
    return null;
  }
  return asNode;
}

/**
 * `paragraph → inlineButton` breaks list structure (listItem must contain blocks like `paragraph`).
 * Only replace at doc top level and inside `blockquote`, not inside `listItem`.
 */
function transformBlock(block: JsonNode, allowParagraphToButton: boolean): JsonNode {
  const inlineBtn = allowParagraphToButton ? paragraphToInlineButton(block) : null;
  if (inlineBtn != null) {
    return inlineBtn;
  }
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    if (Array.isArray(block.content)) {
      return {
        ...block,
        content: (block.content as JsonNode[]).map((item) => transformBlock(item, true)),
      };
    }
  }
  if (block.type === 'listItem' && Array.isArray(block.content)) {
    return {
      ...block,
      content: (block.content as JsonNode[]).map((inner) => transformBlock(inner, false)),
    };
  }
  if (block.type === 'blockquote' && Array.isArray(block.content)) {
    return {
      ...block,
      content: (block.content as JsonNode[]).map((inner) => transformBlock(inner, true)),
    };
  }
  return block;
}

/**
 * Mutates a Tiptap doc-shaped object: replaces eligible single-link paragraphs with `inlineButton`.
 */
export function applyTrelloSmartLinksToDescriptionDoc(doc: { type: string; content?: unknown[] }): void {
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return;
  }
  doc.content = (doc.content as JsonNode[]).map((b) => transformBlock(b, true));
}

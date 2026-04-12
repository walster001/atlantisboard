import { createRequire } from 'node:module';

/** Subset of markdown-it Token used by this converter. */
interface MdToken {
  readonly type: string;
  readonly tag: string;
  readonly content: string;
  readonly info: string;
  readonly hidden: boolean;
  readonly children: MdToken[] | null;
  attrGet(name: string): string | null;
}

const requireMarkdownIt = createRequire(import.meta.url);
// markdown-it ships as CJS; avoid default-import typing friction with `export =`.
const MarkdownItCtor = requireMarkdownIt('markdown-it') as new (
  preset?: string,
  options?: { html?: boolean; linkify?: boolean; typographer?: boolean }
) => { parse: (src: string, env?: object) => MdToken[] };

const MD_PARSER = new MarkdownItCtor('commonmark', {
  html: false,
  linkify: false,
  typographer: false,
});
import {
  CARD_DESCRIPTION_JSON_MAX_LENGTH,
  CARD_DESCRIPTION_TEXT_MAX_LENGTH,
} from '../constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';
import { plainTextToCardDescriptionJson } from './plainTextToCardDescriptionJson.js';
import {
  applyTrelloSmartLinksToDescriptionDoc,
} from './trelloSmartLinksPostProcess.js';
import { preprocessTrelloDescriptionForMarkdown } from './trelloDescriptionMarkdownPreprocess.js';

function isTextNode(n: unknown): n is { type: string; text: string; marks?: unknown[] } {
  return (
    typeof n === 'object' &&
    n !== null &&
    (n as { type?: unknown }).type === 'text' &&
    typeof (n as { text?: unknown }).text === 'string'
  );
}

function findInlineClose(children: MdToken[], openIdx: number, name: string): number {
  let depth = 1;
  for (let j = openIdx + 1; j < children.length; j++) {
    const t = children[j];
    if (t.type === `${name}_open`) {
      depth++;
    } else if (t.type === `${name}_close`) {
      depth--;
      if (depth === 0) {
        return j;
      }
    }
  }
  return children.length - 1;
}

function walkInline(children: MdToken[] | null): unknown[] {
  if (children == null || children.length === 0) {
    return [];
  }
  const out: unknown[] = [];
  let i = 0;
  while (i < children.length) {
    const t = children[i];
    if (t.type === 'text') {
      if (t.content.length > 0) {
        out.push({ type: 'text', text: t.content });
      }
      i++;
    } else if (t.type === 'softbreak' || t.type === 'hardbreak') {
      out.push({ type: 'hardBreak' });
      i++;
    } else if (t.type === 'code_inline') {
      out.push({
        type: 'text',
        text: t.content,
        marks: [{ type: 'code' }],
      });
      i++;
    } else if (t.type === 'strong_open') {
      const closeIdx = findInlineClose(children, i, 'strong');
      const inner = walkInline(children.slice(i + 1, closeIdx));
      for (const node of inner) {
        if (isTextNode(node)) {
          out.push({
            ...node,
            marks: [...(node.marks ?? []), { type: 'bold' }],
          });
        } else {
          out.push(node);
        }
      }
      i = closeIdx + 1;
    } else if (t.type === 'em_open') {
      const closeIdx = findInlineClose(children, i, 'em');
      const inner = walkInline(children.slice(i + 1, closeIdx));
      for (const node of inner) {
        if (isTextNode(node)) {
          out.push({
            ...node,
            marks: [...(node.marks ?? []), { type: 'italic' }],
          });
        } else {
          out.push(node);
        }
      }
      i = closeIdx + 1;
    } else if (t.type === 's_open') {
      const closeIdx = findInlineClose(children, i, 's');
      const inner = walkInline(children.slice(i + 1, closeIdx));
      for (const node of inner) {
        if (isTextNode(node)) {
          out.push({
            ...node,
            marks: [...(node.marks ?? []), { type: 'strike' }],
          });
        } else {
          out.push(node);
        }
      }
      i = closeIdx + 1;
    } else if (t.type === 'link_open') {
      const closeIdx = findInlineClose(children, i, 'link');
      const href = t.attrGet('href') ?? '';
      const title = t.attrGet('title') ?? '';
      const inner = walkInline(children.slice(i + 1, closeIdx));
      const linkMark = {
        type: 'link',
        attrs: {
          href,
          ...(title.length > 0 ? { title } : {}),
        },
      };
      for (const node of inner) {
        if (isTextNode(node)) {
          out.push({
            ...node,
            marks: [...(node.marks ?? []), linkMark],
          });
        } else {
          out.push(node);
        }
      }
      i = closeIdx + 1;
    } else if (t.type === 'image') {
      const src = t.attrGet('src') ?? '';
      if (src.length > 0) {
        out.push({
          type: 'image',
          attrs: {
            src,
            alt: t.attrGet('alt') ?? '',
          },
        });
      }
      i++;
    } else {
      i++;
    }
  }
  return out;
}

function skipTable(tokens: MdToken[], start: number): number {
  if (tokens[start]?.type !== 'table_open') {
    return start;
  }
  let depth = 1;
  let j = start + 1;
  while (j < tokens.length && depth > 0) {
    if (tokens[j].type === 'table_open') {
      depth++;
    }
    if (tokens[j].type === 'table_close') {
      depth--;
    }
    j++;
  }
  return j;
}

function parseBlockRange(tokens: MdToken[], start: number, end: number): unknown[] {
  const content: unknown[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i];
    // Do not skip `hidden` tokens globally: markdown-it sets `hidden` on the synthetic
    // `paragraph_open` / `paragraph_close` wrapping tight list item text. Skipping those
    // leaves the following `inline` token unhandled and produces empty list items.
    if (t.type === 'table_open') {
      i = skipTable(tokens, i);
      continue;
    }
    if (t.type === 'heading_open') {
      const level = Math.min(6, Math.max(1, Number.parseInt(t.tag.slice(1), 10) || 1));
      const inlineTok = tokens[i + 1];
      const closeTok = tokens[i + 2];
      if (inlineTok?.type === 'inline' && closeTok?.type === 'heading_close') {
        const inner = walkInline(inlineTok.children);
        content.push({
          type: 'heading',
          attrs: { level },
          content: inner.length > 0 ? inner : [{ type: 'hardBreak' }],
        });
        i += 3;
        continue;
      }
    }
    if (t.type === 'paragraph_open') {
      const inlineTok = tokens[i + 1];
      const closeTok = tokens[i + 2];
      if (inlineTok?.type === 'inline' && closeTok?.type === 'paragraph_close') {
        const inner = walkInline(inlineTok.children);
        content.push({
          type: 'paragraph',
          content: inner.length > 0 ? inner : [{ type: 'hardBreak' }],
        });
        i += 3;
        continue;
      }
    }
    if (t.type === 'fence') {
      const lang = (t.info ?? '').trim().split(/\s+/)[0] ?? '';
      const code = t.content.replace(/\n$/, '');
      content.push({
        type: 'codeBlock',
        ...(lang.length > 0 ? { attrs: { language: lang } } : {}),
        content: code.length > 0 ? [{ type: 'text', text: code }] : [{ type: 'text', text: '\u200b' }],
      });
      i++;
      continue;
    }
    if (t.type === 'hr') {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }
    if (t.type === 'blockquote_open') {
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (tokens[j].type === 'blockquote_open') {
          depth++;
        }
        if (tokens[j].type === 'blockquote_close') {
          depth--;
        }
        j++;
      }
      const innerBlocks = parseBlockRange(tokens, i + 1, j - 1);
      content.push({
        type: 'blockquote',
        content:
          innerBlocks.length > 0
            ? innerBlocks
            : [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
      });
      i = j;
      continue;
    }
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const listType = t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList';
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          depth++;
        }
        if (tokens[j].type === 'bullet_list_close' || tokens[j].type === 'ordered_list_close') {
          depth--;
        }
        j++;
      }
      const items = parseListItems(tokens, i + 1, j - 1);
      if (listType === 'orderedList') {
        const rawStart = t.attrGet('start');
        const startNum =
          typeof rawStart === 'number' && Number.isFinite(rawStart)
            ? Math.trunc(rawStart)
            : typeof rawStart === 'string' && rawStart.length > 0
              ? Number.parseInt(rawStart, 10)
              : 1;
        if (Number.isFinite(startNum) && startNum > 1) {
          content.push({ type: listType, attrs: { start: startNum }, content: items });
        } else {
          content.push({ type: listType, content: items });
        }
      } else {
        content.push({ type: listType, content: items });
      }
      i = j;
      continue;
    }
    if (
      t.type === 'heading_close' ||
      t.type === 'paragraph_close' ||
      t.type === 'bullet_list_close' ||
      t.type === 'ordered_list_close' ||
      t.type === 'list_item_close' ||
      t.type === 'blockquote_close'
    ) {
      i++;
      continue;
    }
    if (t.type === 'list_item_open') {
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (tokens[j].type === 'list_item_open') {
          depth++;
        }
        if (tokens[j].type === 'list_item_close') {
          depth--;
        }
        j++;
      }
      const innerBlocks = parseBlockRange(tokens, i + 1, j - 1);
      content.push({
        type: 'listItem',
        content:
          innerBlocks.length > 0
            ? innerBlocks
            : [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
      });
      i = j;
      continue;
    }
    i++;
  }
  return content;
}

function parseListItems(tokens: MdToken[], start: number, end: number): unknown[] {
  const items: unknown[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i];
    if (t.type === 'list_item_open') {
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (tokens[j].type === 'list_item_open') {
          depth++;
        }
        if (tokens[j].type === 'list_item_close') {
          depth--;
        }
        j++;
      }
      const innerBlocks = parseBlockRange(tokens, i + 1, j - 1);
      items.push({
        type: 'listItem',
        content:
          innerBlocks.length > 0
            ? innerBlocks
            : [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
      });
      i = j;
    } else {
      i++;
    }
  }
  return items;
}

function countTextCharsInDoc(node: unknown): number {
  if (node == null || typeof node !== 'object') {
    return 0;
  }
  const o = node as { type?: unknown; text?: unknown; content?: unknown };
  if (o.type === 'text' && typeof o.text === 'string') {
    return o.text.length;
  }
  if (Array.isArray(o.content)) {
    return o.content.reduce((sum, c) => sum + countTextCharsInDoc(c), 0);
  }
  return 0;
}

/**
 * Converts Trello-style Markdown card descriptions to Tiptap JSON (stringified).
 * Applies smart-link → inlineButton post-processing when valid.
 */
export function markdownToCardDescriptionJson(markdown: string): string | undefined {
  if (markdown.length > CARD_DESCRIPTION_TEXT_MAX_LENGTH * 2) {
    return plainTextToCardDescriptionJson(markdown.slice(0, CARD_DESCRIPTION_TEXT_MAX_LENGTH));
  }
  const normalized = preprocessTrelloDescriptionForMarkdown(markdown);
  const tokens = MD_PARSER.parse(normalized, {}) as MdToken[];
  const body = parseBlockRange(tokens, 0, tokens.length);
  const doc = {
    type: 'doc' as const,
    content: body.length > 0 ? body : [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
  };
  applyTrelloSmartLinksToDescriptionDoc(doc);
  if (countTextCharsInDoc(doc) > CARD_DESCRIPTION_TEXT_MAX_LENGTH) {
    return plainTextToCardDescriptionJson(markdown);
  }
  let json = JSON.stringify(doc);
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH) {
    return plainTextToCardDescriptionJson(markdown);
  }
  if (!isValidCardDescriptionDoc(doc)) {
    return plainTextToCardDescriptionJson(markdown);
  }
  return json;
}

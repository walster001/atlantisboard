import type { JSONContent } from '@tiptap/core';
import {
  buildTrelloImportInlineButton,
  type InlineButtonDocNode,
} from '../../../../shared/utils/trelloImportInlineButton.js';
import { plainTextToCardDescriptionJson } from '../../../../shared/utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../../../../shared/utils/markdownToCardDescriptionJson.js';
import { applyUtf8EmojiToTwemojiInCardDescriptionDoc } from '../../../../shared/utils/utf8EmojiToTwemojiInCardDescriptionDoc.js';
import { CARD_DESCRIPTION_JSON_MAX_LENGTH } from '../../../../shared/constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../../../../shared/validation/cardDescriptionDoc.js';
import { uploadImportInlineImage } from '../../importInlineAssetService.js';
import { logger } from '../../../utils/logger.js';
import type { WekanCard } from './types.js';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

export function sanitizeImportedPlainText(value: string): string {
  return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, ' ').trim();
}

export function sanitizeImportedDescriptionText(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n');
  const stripped = decodeHtmlEntities(stripHtmlTags(withBreaks));
  return stripped
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LEGACY_INLINE_BUTTON_RE =
  /<span[^>]*display\s*:\s*inline-flex[^>]*>\s*<img[^>]*src=['"]([^'"]+)['"][^>]*>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/span>/gi;
const LEGACY_HORIZONTAL_RULE_RE = /<\s*hr\b[^>]*>(?:\s*<\/\s*hr\s*>)?/gi;

function parseInlineStyleDeclarations(styleAttr: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawDecl of styleAttr.split(';')) {
    const idx = rawDecl.indexOf(':');
    if (idx <= 0) {
      continue;
    }
    const key = rawDecl.slice(0, idx).trim().toLowerCase();
    const value = rawDecl.slice(idx + 1).trim();
    if (key !== '' && value !== '') {
      out.set(key, value);
    }
  }
  return out;
}

function extractStyleAttributeFromOpeningTag(openingTag: string): string | null {
  const styleMatch = /\sstyle\s*=\s*(['"])([\s\S]*?)\1/i.exec(openingTag);
  if (styleMatch == null) {
    return null;
  }
  const styleRaw = decodeHtmlEntities((styleMatch[2] ?? '').trim());
  return styleRaw === '' ? null : styleRaw;
}

function extractInlineStyleDeclarationsFromTag(html: string, tagName: 'span' | 'a'): Map<string, string> {
  const openingTagMatch = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  if (openingTagMatch == null) {
    return new Map<string, string>();
  }
  const style = extractStyleAttributeFromOpeningTag(openingTagMatch[0]);
  if (style == null) {
    return new Map<string, string>();
  }
  return parseInlineStyleDeclarations(style);
}

function normalizeImportedInlineColor(value: string | undefined): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') {
    return null;
  }
  if (!/^[#(),.%/\-\s0-9a-zA-Z]+$/.test(raw)) {
    return null;
  }
  return raw.slice(0, 80);
}

function extractInlineButtonColorsFromLegacySpan(fullHtml: string): { textColor?: string; bgColor?: string } {
  const spanDecls = extractInlineStyleDeclarationsFromTag(fullHtml, 'span');
  const anchorDecls = extractInlineStyleDeclarationsFromTag(fullHtml, 'a');
  const textColor =
    normalizeImportedInlineColor(anchorDecls.get('color')) ??
    normalizeImportedInlineColor(spanDecls.get('color'));
  const bgColor =
    normalizeImportedInlineColor(spanDecls.get('background-color')) ??
    normalizeImportedInlineColor(spanDecls.get('background')) ??
    normalizeImportedInlineColor(anchorDecls.get('background-color')) ??
    normalizeImportedInlineColor(anchorDecls.get('background'));
  return {
    ...(textColor != null ? { textColor } : {}),
    ...(bgColor != null ? { bgColor } : {}),
  };
}

function plainTextParagraphNodes(raw: string): Array<Record<string, unknown>> {
  const text = raw.trim();
  if (text === '') {
    return [];
  }
  return text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
    .map((segment) => ({
      type: 'paragraph',
      content: segment
        .split(/\n/)
        .flatMap((line, idx) =>
          idx === 0 ? [{ type: 'text', text: line }] : [{ type: 'hardBreak' }, { type: 'text', text: line }],
        ),
    }));
}

function pushMarkdownOrPlainAsBlocks(raw: string, nodes: Array<Record<string, unknown>>, plainOnly: boolean): void {
  if (plainOnly) {
    nodes.push(...plainTextParagraphNodes(raw));
    return;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return;
  }
  const fromMd = markdownToCardDescriptionJson(trimmed);
  if (fromMd != null) {
    try {
      const parsed = JSON.parse(fromMd) as { type?: unknown; content?: unknown };
      if (parsed.type === 'doc' && Array.isArray(parsed.content)) {
        for (const block of parsed.content) {
          if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
            nodes.push(block as Record<string, unknown>);
          }
        }
        return;
      }
    } catch {
      // fall through
    }
  }
  nodes.push(...plainTextParagraphNodes(raw));
}

function buildWekanDescriptionDocNodes(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, string>,
  localizedByIconSrc: ReadonlyMap<string, string>,
  plainTextSegmentsOnly: boolean,
): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  let cursor = 0;
  LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
  LEGACY_HORIZONTAL_RULE_RE.lastIndex = 0;
  while (cursor < description.length) {
    LEGACY_INLINE_BUTTON_RE.lastIndex = cursor;
    LEGACY_HORIZONTAL_RULE_RE.lastIndex = cursor;
    const inlineMatch = LEGACY_INLINE_BUTTON_RE.exec(description);
    const hrMatch = LEGACY_HORIZONTAL_RULE_RE.exec(description);
    if (inlineMatch == null && hrMatch == null) {
      break;
    }
    const nextMatch =
      inlineMatch != null && (hrMatch == null || inlineMatch.index <= hrMatch.index)
        ? { kind: 'inlineButton' as const, match: inlineMatch }
        : { kind: 'horizontalRule' as const, match: hrMatch as RegExpExecArray };
    const before = description.slice(cursor, nextMatch.match.index);
    pushMarkdownOrPlainAsBlocks(before, nodes, plainTextSegmentsOnly);
    if (nextMatch.kind === 'horizontalRule') {
      nodes.push({ type: 'horizontalRule' });
      cursor = nextMatch.match.index + nextMatch.match[0].length;
      continue;
    }
    const [full, rawIconSrc, rawHref, rawButtonText] = nextMatch.match;
    const iconSrc = decodeHtmlEntities((rawIconSrc ?? '').trim());
    const href = decodeHtmlEntities((rawHref ?? '').trim());
    const buttonText = decodeHtmlEntities((rawButtonText ?? '').replace(/\s+/g, ' ').trim());
    const inlineButton = buildTrelloImportInlineButton(href, buttonText);
    if (inlineButton != null) {
      const replacement = replacementByIconSrc.get(iconSrc);
      const localized = localizedByIconSrc.get(iconSrc);
      const colors = extractInlineButtonColorsFromLegacySpan(full);
      const attrs = {
        ...inlineButton.attrs,
        ...colors,
        ...(replacement != null ? { iconSrc: replacement } : localized != null ? { iconSrc: localized } : {}),
      };
      nodes.push({
        type: (inlineButton as InlineButtonDocNode).type,
        attrs,
      });
    } else {
      pushMarkdownOrPlainAsBlocks(full, nodes, true);
    }
    cursor = nextMatch.match.index + full.length;
  }
  const tail = description.slice(cursor);
  pushMarkdownOrPlainAsBlocks(tail, nodes, plainTextSegmentsOnly);
  return nodes;
}

export function wekanDescriptionToCardJson(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, string>,
  localizedByIconSrc: ReadonlyMap<string, string>,
): string {
  if (description.trim() === '') {
    return '';
  }
  let nodes = buildWekanDescriptionDocNodes(description, replacementByIconSrc, localizedByIconSrc, false);
  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  let doc: JSONContent = applyUtf8EmojiToTwemojiInCardDescriptionDoc({
    type: 'doc',
    content: nodes as JSONContent[],
  });
  let json = JSON.stringify(doc);
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH || !isValidCardDescriptionDoc(doc)) {
    nodes = buildWekanDescriptionDocNodes(description, replacementByIconSrc, localizedByIconSrc, true);
    doc = applyUtf8EmojiToTwemojiInCardDescriptionDoc({
      type: 'doc',
      content: nodes as JSONContent[],
    });
    json = JSON.stringify(doc);
  }
  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH || !isValidCardDescriptionDoc(doc)) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  return json;
}

function inferImageMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.svg')) return 'image/svg+xml';
  if (lower.includes('.ico')) return 'image/x-icon';
  return 'image/png';
}

function resolveFetchableIconUrl(iconSrc: string): string | null {
  const trimmed = iconSrc.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/cdn') || trimmed.startsWith('/api/')) {
    const base = (process.env.APP_URL || process.env.CORS_ORIGIN || '').trim().replace(/\/$/, '');
    if (base === '') {
      return null;
    }
    return `${base}${trimmed}`;
  }
  return null;
}

export async function buildLocalizedInlineIconMap(
  buttons: readonly { iconSrc: string }[],
): Promise<Map<string, string>> {
  const localizedByIconSrc = new Map<string, string>();
  const uniqueIconSources = [...new Set(buttons.map((b) => b.iconSrc.trim()).filter((s) => s !== ''))];
  for (const iconSrc of uniqueIconSources) {
    const fetchable = resolveFetchableIconUrl(iconSrc);
    if (fetchable == null) {
      continue;
    }
    try {
      const response = await fetch(fetchable);
      if (!response.ok) {
        continue;
      }
      const contentTypeRaw = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const contentType = contentTypeRaw.startsWith('image/') ? contentTypeRaw : inferImageMimeFromUrl(fetchable);
      const arr = await response.arrayBuffer();
      const buffer = Buffer.from(arr);
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        continue;
      }
      const localUrl = await uploadImportInlineImage(buffer, contentType, iconSrc.split('/').pop());
      localizedByIconSrc.set(iconSrc, localUrl);
    } catch (error) {
      logger.warn({ error, iconSrc }, 'Failed to localize imported inline button icon');
    }
  }
  return localizedByIconSrc;
}

export function extractLegacyInlineButtonCandidates(cards: readonly WekanCard[]): Array<{ iconSrc: string }> {
  const out: Array<{ iconSrc: string }> = [];
  for (const card of cards) {
    const description = typeof card.description === 'string' ? card.description : '';
    if (description.trim() === '') {
      continue;
    }
    LEGACY_INLINE_BUTTON_RE.lastIndex = 0;
    let match: RegExpExecArray | null = LEGACY_INLINE_BUTTON_RE.exec(description);
    while (match != null) {
      const iconSrc = decodeHtmlEntities((match[1] ?? '').trim());
      if (iconSrc !== '') {
        out.push({ iconSrc });
      }
      match = LEGACY_INLINE_BUTTON_RE.exec(description);
    }
  }
  return out;
}

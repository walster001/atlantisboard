import type { JSONContent } from '@tiptap/core';
import {
  buildTrelloImportInlineButton,
  type InlineButtonDocNode,
} from '../utils/trelloImportInlineButton.js';
import { plainTextToCardDescriptionJson } from '../utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../utils/markdownToCardDescriptionJson.js';
import { applyUtf8EmojiToTwemojiInCardDescriptionDoc } from '../utils/utf8EmojiToTwemojiInCardDescriptionDoc.js';
import { CARD_DESCRIPTION_JSON_MAX_LENGTH } from '../constants/cardDescription.js';
import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';
import { normalizeInlineButtonIconSrcKey } from './importPreflight.js';
import {
  decodeWekanHtmlEntities,
  hasLegacyWekanInlineButtonHtml,
  LEGACY_WEKAN_INLINE_BUTTON_RES,
} from './wekanLegacyInlineHtmlPatterns.js';

export { hasLegacyWekanInlineButtonHtml, decodeWekanHtmlEntities, LEGACY_WEKAN_INLINE_BUTTON_RES };

const LEGACY_HORIZONTAL_RULE_RE = /<\s*hr\b[^>]*>(?:\s*<\/\s*hr\s*>)?/gi;

function resolveInlineIconMapValue<T>(
  map: ReadonlyMap<string, T>,
  iconSrc: string,
): T | undefined {
  const direct = map.get(iconSrc);
  if (direct != null) {
    return direct;
  }
  const normalized = normalizeInlineButtonIconSrcKey(iconSrc);
  if (normalized !== iconSrc) {
    return map.get(normalized);
  }
  return undefined;
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function normalizeImportedInlineHref(rawHref: string): string {
  const trimmed = rawHref.trim();
  if (trimmed.toLowerCase().startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
}

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
  const styleRaw = decodeWekanHtmlEntities((styleMatch[2] ?? '').trim());
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

/** Colors parsed from legacy Wekan inline-button HTML (for import UI defaults). */
export function extractWekanLegacyInlineButtonColorsFromHtml(
  fullHtml: string,
): { textColor?: string; bgColor?: string } {
  return extractInlineButtonColorsFromLegacySpan(fullHtml);
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

export interface WekanInlineButtonImportReplacement {
  readonly iconUrl?: string;
}

export interface WekanInlineButtonImportColorOverrides {
  readonly textColor?: string;
  readonly bgColor?: string;
}

function buildWekanDescriptionDocNodes(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, WekanInlineButtonImportReplacement>,
  localizedByIconSrc: ReadonlyMap<string, string>,
  plainTextSegmentsOnly: boolean,
  globalColorOverrides: WekanInlineButtonImportColorOverrides = {},
): Array<Record<string, unknown>> {
  const input = decodeWekanHtmlEntities(description);
  const nodes: Array<Record<string, unknown>> = [];
  let cursor = 0;
  LEGACY_HORIZONTAL_RULE_RE.lastIndex = 0;
  while (cursor < input.length) {
    LEGACY_HORIZONTAL_RULE_RE.lastIndex = cursor;
    let inlineMatch: { readonly re: RegExp; readonly match: RegExpExecArray } | null = null;
    for (const re of LEGACY_WEKAN_INLINE_BUTTON_RES) {
      re.lastIndex = cursor;
      const m = re.exec(input);
      if (m == null) {
        continue;
      }
      if (inlineMatch == null || m.index < inlineMatch.match.index) {
        inlineMatch = { re, match: m };
      }
    }
    const hrMatch = LEGACY_HORIZONTAL_RULE_RE.exec(input);
    if (inlineMatch == null && hrMatch == null) {
      break;
    }
    const nextMatch =
      inlineMatch != null && (hrMatch == null || inlineMatch.match.index <= hrMatch.index)
        ? { kind: 'inlineButton' as const, match: inlineMatch.match }
        : { kind: 'horizontalRule' as const, match: hrMatch as RegExpExecArray };
    const before = input.slice(cursor, nextMatch.match.index);
    pushMarkdownOrPlainAsBlocks(before, nodes, plainTextSegmentsOnly);
    if (nextMatch.kind === 'horizontalRule') {
      nodes.push({ type: 'horizontalRule' });
      cursor = nextMatch.match.index + nextMatch.match[0].length;
      continue;
    }
    const full = nextMatch.match[0];
    const g1 = decodeWekanHtmlEntities((nextMatch.match[1] ?? '').trim());
    const g2 = decodeWekanHtmlEntities((nextMatch.match[2] ?? '').trim());
    const g3 = decodeWekanHtmlEntities((nextMatch.match[3] ?? '').trim());
    const iconSrc = g1.includes('://') || g1.startsWith('/') ? g1 : g2;
    const href = normalizeImportedInlineHref(g1 === iconSrc ? g2 : g1);
    const buttonTextRaw = g3 !== '' ? g3 : stripHtmlTags(full);
    const buttonText = decodeWekanHtmlEntities(buttonTextRaw).replace(/\s+/g, ' ').trim();
    const inlineButton = buildTrelloImportInlineButton(href, buttonText);
    if (inlineButton != null) {
      const replacement = resolveInlineIconMapValue(replacementByIconSrc, iconSrc);
      const localized = resolveInlineIconMapValue(localizedByIconSrc, iconSrc);
      const colors = extractInlineButtonColorsFromLegacySpan(full);
      const attrs = {
        ...inlineButton.attrs,
        ...colors,
        ...(globalColorOverrides.textColor != null ? { textColor: globalColorOverrides.textColor } : {}),
        ...(globalColorOverrides.bgColor != null ? { bgColor: globalColorOverrides.bgColor } : {}),
        ...(replacement?.iconUrl != null
          ? { iconSrc: replacement.iconUrl }
          : localized != null
            ? { iconSrc: localized }
            : {}),
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
  const tail = input.slice(cursor);
  pushMarkdownOrPlainAsBlocks(tail, nodes, plainTextSegmentsOnly);
  return nodes;
}

/**
 * Convert legacy Wekan description HTML (inline-flex button spans) to TipTap JSON.
 */
export function wekanLegacyHtmlToCardDescriptionJson(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, WekanInlineButtonImportReplacement> = new Map(),
  localizedByIconSrc: ReadonlyMap<string, string> = new Map(),
  globalColorOverrides: WekanInlineButtonImportColorOverrides = {},
): string {
  if (description.trim() === '') {
    return '';
  }
  let nodes = buildWekanDescriptionDocNodes(
    description,
    replacementByIconSrc,
    localizedByIconSrc,
    false,
    globalColorOverrides,
  );
  if (nodes.length === 0) {
    return plainTextToCardDescriptionJson(description) ?? '';
  }
  let doc: JSONContent = applyUtf8EmojiToTwemojiInCardDescriptionDoc({
    type: 'doc',
    content: nodes as JSONContent[],
  });
  let json = JSON.stringify(doc);
  if (json.length > CARD_DESCRIPTION_JSON_MAX_LENGTH || !isValidCardDescriptionDoc(doc)) {
    nodes = buildWekanDescriptionDocNodes(
      description,
      replacementByIconSrc,
      localizedByIconSrc,
      true,
      globalColorOverrides,
    );
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

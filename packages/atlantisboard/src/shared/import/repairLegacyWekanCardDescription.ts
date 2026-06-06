import type { JSONContent } from '@tiptap/core';
import { isValidCardDescriptionDoc } from '../validation/cardDescriptionDoc.js';
import { hasLegacyWekanInlineButtonHtml, wekanLegacyHtmlToCardDescriptionJson } from './wekanLegacyInlineHtml.js';

function collectTextFromNode(node: JSONContent): string {
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }
  if (!Array.isArray(node.content)) {
    return '';
  }
  return node.content.map((child) => collectTextFromNode(child)).join('');
}

function extractBlockPlainText(block: JSONContent): string {
  return collectTextFromNode(block).trim();
}

/**
 * Repairs TipTap JSON where legacy Wekan HTML was stored as literal text (markdown fallback).
 * Returns a new JSON string or null when no repair was needed or possible.
 */
export function repairLegacyWekanHtmlInCardDescriptionJson(descriptionJson: string): string | null {
  if (!hasLegacyWekanInlineButtonHtml(descriptionJson)) {
    return null;
  }

  let parsed: JSONContent;
  try {
    parsed = JSON.parse(descriptionJson) as JSONContent;
  } catch {
    if (descriptionJson.trim() !== '' && hasLegacyWekanInlineButtonHtml(descriptionJson)) {
      const direct = wekanLegacyHtmlToCardDescriptionJson(descriptionJson);
      if (direct !== '' && direct.includes('inlineButton')) {
        try {
          const doc = JSON.parse(direct) as unknown;
          if (isValidCardDescriptionDoc(doc)) {
            return direct;
          }
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  if (parsed.type !== 'doc' || !Array.isArray(parsed.content)) {
    return null;
  }

  const newContent: JSONContent[] = [];
  let repairedAny = false;

  for (const block of parsed.content) {
    const blockText = extractBlockPlainText(block);
    if (blockText === '' || !hasLegacyWekanInlineButtonHtml(blockText)) {
      newContent.push(block);
      continue;
    }
    const fixed = wekanLegacyHtmlToCardDescriptionJson(blockText);
    if (fixed === '' || !fixed.includes('inlineButton')) {
      newContent.push(block);
      continue;
    }
    try {
      const fixedDoc = JSON.parse(fixed) as JSONContent;
      if (Array.isArray(fixedDoc.content)) {
        newContent.push(...fixedDoc.content);
        repairedAny = true;
        continue;
      }
    } catch {
      newContent.push(block);
      continue;
    }
    newContent.push(block);
  }

  if (!repairedAny) {
    const joined = parsed.content
      .map((block) => extractBlockPlainText(block))
      .filter((t) => t !== '')
      .join('\n\n');
    if (joined !== '' && hasLegacyWekanInlineButtonHtml(joined)) {
      const fixed = wekanLegacyHtmlToCardDescriptionJson(joined);
      if (fixed !== '' && fixed.includes('inlineButton')) {
        try {
          const doc = JSON.parse(fixed) as unknown;
          if (isValidCardDescriptionDoc(doc)) {
            return fixed;
          }
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  const doc: JSONContent = { type: 'doc', content: newContent };
  if (!isValidCardDescriptionDoc(doc)) {
    return null;
  }
  return JSON.stringify(doc);
}

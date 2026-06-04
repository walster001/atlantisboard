import type { Extensions } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { JSDOM } from 'jsdom';
import { hasLegacyWekanInlineButtonHtml } from '../../shared/import/wekanLegacyInlineHtmlPatterns.js';
import { wekanLegacyHtmlToCardDescriptionJson } from '../../shared/import/wekanLegacyInlineHtml.js';
import { repairLegacyWekanHtmlInCardDescriptionJson } from '../../shared/import/repairLegacyWekanCardDescription.js';
import { sanitizeHtml } from '../../shared/utils/sanitizeHtml.js';
import { isValidCardDescriptionDoc } from '../../shared/validation/cardDescriptionDoc.js';

let cachedMigrationExtensions: Extensions | undefined;

function getMigrationExtensions(): Extensions {
  if (cachedMigrationExtensions) {
    return cachedMigrationExtensions;
  }
  cachedMigrationExtensions = [
    StarterKit.configure({
      link: false,
      underline: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: false }),
  ];
  return cachedMigrationExtensions;
}

function docHasRenderableContent(node: unknown): boolean {
  if (node == null || typeof node !== 'object') {
    return false;
  }
  const record = node as { type?: unknown; text?: unknown; content?: unknown };
  if (record.type === 'text' && typeof record.text === 'string' && record.text.trim() !== '') {
    return true;
  }
  const mediaTypes = new Set(['image', 'imageResize', 'video', 'inlineButton', 'twemojiEmoji']);
  if (typeof record.type === 'string' && mediaTypes.has(record.type)) {
    return true;
  }
  if (!Array.isArray(record.content)) {
    return false;
  }
  return record.content.some((child) => docHasRenderableContent(child));
}

/** True when stored JSON is empty/placeholder but legacy HTML may still hold content. */
export function descriptionJsonNeedsHtmlMigration(description: string | undefined): boolean {
  if (description == null || description.trim() === '') {
    return true;
  }
  try {
    const parsed: unknown = JSON.parse(description);
    if (isValidCardDescriptionDoc(parsed)) {
      return !docHasRenderableContent(parsed);
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as { type?: unknown }).type === 'doc'
    ) {
      return !docHasRenderableContent(parsed);
    }
  } catch {
    return true;
  }
  return false;
}

/** Convert sanitized legacy HTML to TipTap JSON string, or null when migration is not possible. */
export function migrateLegacyDescriptionHtmlToJson(descriptionHtml: string): string | null {
  const sanitized = sanitizeHtml(descriptionHtml);
  if (sanitized.trim() === '') {
    return null;
  }
  if (hasLegacyWekanInlineButtonHtml(sanitized)) {
    const fromWekan = wekanLegacyHtmlToCardDescriptionJson(sanitized);
    if (fromWekan !== '') {
      try {
        const parsed: unknown = JSON.parse(fromWekan);
        if (isValidCardDescriptionDoc(parsed)) {
          return fromWekan;
        }
      } catch {
        /* fall through to generic HTML migration */
      }
    }
  }
  try {
    const schema = getSchema(getMigrationExtensions());
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${sanitized}</body></html>`);
    const doc = PMDOMParser.fromSchema(schema).parse(dom.window.document.body);
    const json = doc.toJSON();
    if (!docHasRenderableContent(json)) {
      return null;
    }
    return JSON.stringify(json);
  } catch {
    return null;
  }
}

export function tryMigrateCardDescriptionFields(input: {
  description: string | undefined;
  descriptionHtml: string | undefined;
}): { description: string; clearDescriptionHtml: boolean } | null {
  const description = input.description?.trim() ?? '';
  if (description !== '') {
    const repaired = repairLegacyWekanHtmlInCardDescriptionJson(description);
    if (repaired != null) {
      return { description: repaired, clearDescriptionHtml: false };
    }
  }
  const html = input.descriptionHtml?.trim() ?? '';
  if (html === '') {
    return null;
  }
  if (!descriptionJsonNeedsHtmlMigration(input.description)) {
    return null;
  }
  const migrated = migrateLegacyDescriptionHtmlToJson(html);
  if (migrated == null) {
    return null;
  }
  return { description: migrated, clearDescriptionHtml: true };
}

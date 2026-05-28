import { generateText, type Extensions, type JSONContent } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import ImageResize from 'tiptap-extension-resize-image';
import { repairLegacyWekanHtmlInCardDescriptionJson } from '../../../shared/import/repairLegacyWekanCardDescription.js';
import { isValidCardDescriptionDoc } from '../../../shared/validation/cardDescriptionDoc.js';
import {
  CardDescriptionHeading,
  CardDescriptionParagraph,
} from './cardDescriptionBlockLineHeight.js';
import { TwemojiEmoji } from './tiptapTwemojiExtension.js';
import { TiptapInlineButton } from './tiptapInlineButtonExtension.js';
import { TiptapVideo } from './tiptapVideoExtension.js';
import {
  countHardBreaksInJson,
  hasNonTextRenderableContent,
  isSingleParagraphSingleHardBreakPlaceholder,
  repairCardDescriptionDocForPm,
} from './cardDescriptionTiptapDoc.js';

const lowlight = createLowlight(common);

export const emptyCardDescriptionJson: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
};

let cachedExtensionsReadonly: Extensions | undefined;

/** Extensions for static render, plain-text preview, and validation parity (no placeholder / no limit UI). */
export function getCardDescriptionExtensions(): Extensions {
  if (cachedExtensionsReadonly) {
    return cachedExtensionsReadonly;
  }
  cachedExtensionsReadonly = [
    StarterKit.configure({
      codeBlock: false,
      paragraph: false,
      heading: false,
      // Link + underline ship with StarterKit; configure link here to avoid a second Link extension.
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
          class: 'card-desc-tiptap-link',
        },
      },
    }),
    CardDescriptionHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    CardDescriptionParagraph,
    TextStyle.configure({ mergeNestedSpanStyles: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Color.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    Image.configure({ inline: false, allowBase64: false }),
    ImageResize.configure({
      inline: false,
      minWidth: 80,
      maxWidth: 1400,
    }),
    TiptapVideo.configure({
      HTMLAttributes: {
        controls: true,
        playsinline: true,
        preload: 'metadata',
        class: 'card-desc-video-player',
      },
    }),
    TiptapInlineButton.configure({
      inline: false,
      minWidth: 80,
      maxWidth: 800,
    }),
    TwemojiEmoji,
    CodeBlockLowlight.configure({ lowlight }),
  ];
  return cachedExtensionsReadonly;
}

/** Editor extensions: schema + placeholder. */
export function getCardDescriptionEditorExtensions(placeholder: string): Extensions {
  return [
    ...getCardDescriptionExtensions(),
    Placeholder.configure({ placeholder }),
  ];
}

export function parseCardDescriptionJson(value: string | undefined | null): JSONContent {
  if (value == null || value.trim() === '') {
    return emptyCardDescriptionJson;
  }
  const repairedJson = repairLegacyWekanHtmlInCardDescriptionJson(value);
  const source = repairedJson ?? value;
  try {
    const parsed: unknown = JSON.parse(source) as unknown;
    if (isValidCardDescriptionDoc(parsed)) {
      return repairCardDescriptionDocForPm(parsed as JSONContent);
    }
    /*
     * Imports (e.g. Trello markdown → JSON) may include attrs or shapes the strict REST validator
     * rejects even though Tiptap can edit and re-save them. Treat any well-formed `doc` as
     * loadable so Save does not treat the editor payload as “empty” and clear the field.
     */
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as { type?: unknown }).type === 'doc'
    ) {
      return repairCardDescriptionDocForPm(parsed as JSONContent);
    }
  } catch {
    /* fall through */
  }
  return emptyCardDescriptionJson;
}

/**
 * Kanban list cards use a plain-text first-line preview. `inlineButton` is a block node (flex
 * wrapper, fixed width, offsets) and breaks list-item flow. For that surface only, drop inline
 * button nodes entirely (no label text in the preview).
 */
export function stripInlineButtonsForBoardPreview(doc: JSONContent): JSONContent {
  const mapNodes = (nodes: JSONContent[] | undefined): JSONContent[] | undefined => {
    if (nodes == null) {
      return undefined;
    }
    const result: JSONContent[] = [];
    for (const node of nodes) {
      if (node.type === 'inlineButton') {
        continue;
      }
      if (Array.isArray(node.content)) {
        const mapped = mapNodes(node.content);
        result.push({
          ...node,
          content: mapped ?? [],
        });
      } else {
        result.push({ ...node });
      }
    }
    return result;
  };

  if (doc.type !== 'doc') {
    return doc;
  }
  return repairCardDescriptionDocForPm({
    ...doc,
    content: mapNodes(doc.content) ?? [],
  });
}

export function isCardDescriptionEmpty(doc: JSONContent): boolean {
  if (hasNonTextRenderableContent(doc)) {
    return false;
  }

  const extensions = getCardDescriptionExtensions();
  const textTrimmed = generateText(doc, extensions, {
    blockSeparator: '\n',
  }).trim();
  if (textTrimmed.length > 0) {
    return false;
  }

  const hardBreakCount = countHardBreaksInJson(doc);
  if (hardBreakCount === 0) {
    return true;
  }
  if (hardBreakCount === 1 && isSingleParagraphSingleHardBreakPlaceholder(doc)) {
    return true;
  }
  return false;
}

export function cardDescriptionPreviewText(value: string | undefined | null): string {
  const doc = parseCardDescriptionJson(value ?? '');
  return generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: ' ',
  })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain text with newlines between blocks — for surfaces that need multi-line plain text from a
 * TipTap doc (e.g. exports); list cards use {@link cardDescriptionFirstLogicalLinePlain} instead.
 */
export function cardDescriptionPlainMultiline(value: string | undefined | null): string {
  const doc = parseCardDescriptionJson(value ?? '');
  const raw = generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: '\n',
  });
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * First logical line for kanban card previews: first paragraph / block before a newline from
 * TipTap `generateText` (so “Who:” on the next line in the editor stays off the first line).
 */
export function cardDescriptionFirstLogicalLinePlain(value: string | undefined | null): string {
  const docRaw = parseCardDescriptionJson(value ?? '');
  const doc = stripInlineButtonsForBoardPreview(docRaw);
  if (isCardDescriptionEmpty(doc)) {
    return '';
  }
  const raw = generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: '\n',
  });
  const first = raw.split(/\r?\n/)[0];
  return (first ?? '').trim();
}

/** Plain-text length used for description limits/counter (without Tiptap CharacterCount extension). */
export function getCardDescriptionTextLength(doc: JSONContent): number {
  return generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: '\n',
  }).length;
}

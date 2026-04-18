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
import { isValidCardDescriptionDoc } from '../../../shared/validation/cardDescriptionDoc.js';
import {
  CardDescriptionHeading,
  CardDescriptionParagraph,
} from './cardDescriptionBlockLineHeight.js';
import { TwemojiEmoji } from './tiptapTwemojiExtension.js';
import { TiptapInlineButton } from './tiptapInlineButtonExtension.js';
import { TiptapVideo } from './tiptapVideoExtension.js';

const lowlight = createLowlight(common);

export const emptyCardDescriptionJson: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
};

/**
 * ProseMirror rejects empty `text` nodes; older imports may still contain `text: ""`.
 * Normalizes those (and empty inline containers) so editors and static renderers load safely.
 */
function repairCardDescriptionDocForPm(node: JSONContent, parentType?: string): JSONContent {
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
  try {
    const parsed: unknown = JSON.parse(value) as unknown;
    if (isValidCardDescriptionDoc(parsed)) {
      return repairCardDescriptionDocForPm(parsed as JSONContent);
    }
  } catch {
    /* fall through */
  }
  return emptyCardDescriptionJson;
}

/**
 * Kanban list cards render descriptions in a 2-line clamped preview. `inlineButton` is a block
 * node (flex wrapper, fixed width, offsets) and breaks that layout and list-item flow. For that
 * surface only, drop inline button nodes entirely (no label text in the preview).
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

function countHardBreaksInJson(node: JSONContent | undefined): number {
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
function isSingleParagraphSingleHardBreakPlaceholder(doc: JSONContent): boolean {
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length !== 1) {
    return false;
  }
  const p = doc.content[0];
  if (p?.type !== 'paragraph' || !Array.isArray(p.content)) {
    return false;
  }
  return p.content.length === 1 && p.content[0]?.type === 'hardBreak';
}

export function isCardDescriptionEmpty(doc: JSONContent): boolean {
  const hasNonTextRenderableContent = (node: JSONContent | undefined): boolean => {
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
  };

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
 * Plain text with newlines between blocks — for board/list card previews with `white-space: pre-line`
 * and `lineClamp={2}` so wrapping matches the card detail content (first ~two visual lines).
 */
export function cardDescriptionPlainMultiline(value: string | undefined | null): string {
  const doc = parseCardDescriptionJson(value ?? '');
  const raw = generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: '\n',
  });
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain-text length used for description limits/counter (without Tiptap CharacterCount extension). */
export function getCardDescriptionTextLength(doc: JSONContent): number {
  return generateText(doc, getCardDescriptionExtensions(), {
    blockSeparator: '\n',
  }).length;
}

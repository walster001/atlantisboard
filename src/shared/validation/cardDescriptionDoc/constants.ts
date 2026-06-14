export const MAX_DEPTH = 64;

export const ALLOWED_BLOCK_NODES = new Set<string>([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'imageResize',
  'video',
  'audio',
  'inlineButton',
  'twemojiEmoji',
]);

export const ALLOWED_MARKS = new Set<string>([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'underline',
  'textStyle',
]);

export const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);

/** HTML `ol type` + TipTap defaults (`null`). */
export const ORDERED_LIST_TYPE_VALUES = new Set(['1', 'a', 'A', 'i', 'I']);

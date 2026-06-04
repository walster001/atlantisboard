/**
 * Card description inline link button — block node with image-style resize handles (tiptap-extension-resize-image pattern).
 * Double-click the button in edit mode opens the styling modal (wired via editor.storage.inlineButton.openEditModal).
 */
import { mergeAttributes, Node as TiptapNode } from '@tiptap/core';
import {
  clampOffset,
  normalizeWidthPx,
  parseTranslatePx,
} from './tiptapInlineButtonHelpers.js';
import { createInlineButtonNodeView, type NodeViewContext } from './tiptapInlineButtonNodeView.js';

export const DEFAULT_INLINE_BUTTON_ATTRS = {
  href: 'https://',
  buttonText: 'Button',
  textColor: '#579DFF',
  bgColor: '#1D2125',
  borderRadiusPx: 4,
  iconSrc: null as string | null,
  iconSizePx: 16,
  width: '320' as string | null,
  offsetXPx: 0,
  offsetYPx: 0,
  containerStyle:
    'position: relative; width: 320px; max-width: 100%; height: auto; cursor: pointer; box-sizing: border-box; ',
  wrapperStyle: 'display: flex; justify-content: flex-start;',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineButton: {
      insertInlineButton: () => ReturnType;
    };
  }

  interface Storage {
    inlineButton?: {
      openEditModal: (pos: number) => void;
    };
  }
}

export const TiptapInlineButton = TiptapNode.create({
  name: 'inlineButton',
  draggable: true,
  atom: true,
  group: 'block',
  inline: false,

  addStorage() {
    return {
      openEditModal: (_pos: number) => {
        /* assigned from CardDescriptionEditor */
      },
    };
  },

  addOptions() {
    return {
      inline: false,
      minWidth: 80,
      maxWidth: 800,
    };
  },

  addAttributes() {
    return {
      href: { default: DEFAULT_INLINE_BUTTON_ATTRS.href },
      buttonText: { default: DEFAULT_INLINE_BUTTON_ATTRS.buttonText },
      textColor: { default: DEFAULT_INLINE_BUTTON_ATTRS.textColor },
      bgColor: { default: DEFAULT_INLINE_BUTTON_ATTRS.bgColor },
      borderRadiusPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.borderRadiusPx },
      iconSrc: { default: DEFAULT_INLINE_BUTTON_ATTRS.iconSrc },
      iconSizePx: { default: DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx },
      width: { default: DEFAULT_INLINE_BUTTON_ATTRS.width },
      offsetXPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.offsetXPx },
      offsetYPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.offsetYPx },
      containerStyle: { default: DEFAULT_INLINE_BUTTON_ATTRS.containerStyle },
      wrapperStyle: { default: DEFAULT_INLINE_BUTTON_ATTRS.wrapperStyle },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a.card-desc-inline-button[data-inline-button]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const st = element.getAttribute('style') ?? '';
          const { x, y } = parseTranslatePx(st);
          return {
            offsetXPx: clampOffset(x),
            offsetYPx: clampOffset(y),
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const {
      href,
      buttonText,
      textColor,
      bgColor,
      borderRadiusPx,
      iconSrc,
      iconSizePx,
      width,
      offsetXPx,
      offsetYPx,
    } = node.attrs as {
      href: string;
      buttonText: string;
      textColor: string;
      bgColor: string;
      borderRadiusPx: number;
      iconSrc: string | null;
      iconSizePx: number;
      width?: string | number | null;
      offsetXPx?: number;
      offsetYPx?: number;
    };
    const ox = clampOffset(typeof offsetXPx === 'number' ? offsetXPx : 0);
    const oy = clampOffset(typeof offsetYPx === 'number' ? offsetYPx : 0);
    const explicitWidth = normalizeWidthPx(width);
    const style = [
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'gap: 8px',
      'box-sizing: border-box',
      `width: ${explicitWidth ?? '320px'}`,
      'max-width: 100%',
      'align-self: flex-start',
      'padding: 8px 14px',
      'text-decoration: none',
      `color: ${textColor}`,
      `background-color: ${bgColor}`,
      `border-radius: ${borderRadiusPx}px`,
      'font-size: var(--mantine-font-size-sm)',
      'font-weight: 500',
      ox !== 0 || oy !== 0 ? `transform: translate(${ox}px, ${oy}px)` : '',
    ]
      .filter((s) => s !== '')
      .join('; ');
    const children: [string, Record<string, unknown>, ...unknown[]][] = [];
    if (typeof iconSrc === 'string' && iconSrc.trim() !== '') {
      children.push([
        'img',
        {
          src: iconSrc,
          alt: '',
          width: iconSizePx,
          height: iconSizePx,
          style: 'object-fit:contain;flex-shrink:0',
        },
      ]);
    }
    children.push(['span', { class: 'card-desc-inline-button__text' }, buttonText]);
    return [
      'a',
      mergeAttributes({
        class: 'card-desc-inline-button',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        'data-inline-button': '1',
        style,
      }),
      ...children,
    ];
  },

  renderText({ node }) {
    const t = node.attrs.buttonText;
    return typeof t === 'string' ? t : '';
  },

  addCommands() {
    return {
      insertInlineButton:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { ...DEFAULT_INLINE_BUTTON_ATTRS },
          });
        },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const { inline, minWidth, maxWidth } = this.options;
      const context: NodeViewContext = {
        node,
        editor,
        getPos: typeof getPos === 'function' ? getPos : undefined,
      };
      return createInlineButtonNodeView(context, inline, { minWidth, maxWidth });
    };
  },
});

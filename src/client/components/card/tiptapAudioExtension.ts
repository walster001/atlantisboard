import { mergeAttributes, Node } from '@tiptap/core';
import { normalizeWidthPx } from './tiptapInlineButtonHelpers.js';
import {
  DEFAULT_AUDIO_DISPLAY_DESCRIPTION,
  DEFAULT_AUDIO_DISPLAY_TITLE,
  DEFAULT_AUDIO_BG_COLOR,
  DEFAULT_AUDIO_TEXT_COLOR,
} from './tiptapAudioDisplay.js';
import { mergeDefaultAudioInsertLayout, normalizeHeightPx } from './tiptapAudioLayout.js';

export type AudioLayoutCommit = () => void;

export interface AudioAttributes {
  src: string;
  width?: string | null;
  height?: string | null;
  containerStyle?: string;
  displayTitle?: string;
  displayDescription?: string;
  coverSrc?: string | null;
  textColor?: string;
  bgColor?: string;
  buttonHoverColor?: string | null;
}

export const DEFAULT_AUDIO_CONTAINER_STYLE =
  'position: relative; width: 100%; max-width: 100%; box-sizing: border-box;';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audio: {
      setAudio: (options: AudioAttributes) => ReturnType;
    };
  }

  interface Storage {
    audio?: {
      pendingLayoutCommits: Set<AudioLayoutCommit>;
      openEditModal: (pos: number) => void;
    };
  }
}

function dimensionDigits(value: unknown, normalize: (value: unknown) => string | undefined): string | null {
  const normalized = normalize(value);
  if (normalized == null) {
    return null;
  }
  return String(Math.round(Number(normalized.replace(/px$/i, ''))));
}

export const TiptapAudio = Node.create({
  name: 'audio',
  atom: true,
  draggable: true,
  inline: false,
  group: 'block',
  addStorage() {
    return {
      pendingLayoutCommits: new Set<AudioLayoutCommit>(),
      openEditModal: (_pos: number) => {
        /* assigned from CardDescriptionEditor */
      },
    };
  },
  addOptions() {
    return {
      allowBase64: false,
      minWidth: 240,
      maxWidth: 800,
      minHeight: 96,
      maxHeight: 480,
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      src: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) => {
          const digits = dimensionDigits(attributes.width, normalizeWidthPx);
          if (digits == null) {
            return {};
          }
          return { 'data-width': digits };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-height'),
        renderHTML: (attributes) => {
          const digits = dimensionDigits(attributes.height, normalizeHeightPx);
          if (digits == null) {
            return {};
          }
          return { 'data-height': digits };
        },
      },
      containerStyle: {
        default: DEFAULT_AUDIO_CONTAINER_STYLE,
        parseHTML: (element) => element.getAttribute('data-container-style'),
        renderHTML: (attributes) => {
          const containerStyle =
            typeof attributes.containerStyle === 'string' && attributes.containerStyle.trim() !== ''
              ? attributes.containerStyle
              : DEFAULT_AUDIO_CONTAINER_STYLE;
          return { 'data-container-style': containerStyle };
        },
      },
      displayTitle: {
        default: DEFAULT_AUDIO_DISPLAY_TITLE,
        parseHTML: (element) => element.getAttribute('data-display-title'),
        renderHTML: (attributes) => {
          const title =
            typeof attributes.displayTitle === 'string' ? attributes.displayTitle.trim() : '';
          if (title === '') {
            return {};
          }
          return { 'data-display-title': title };
        },
      },
      displayDescription: {
        default: DEFAULT_AUDIO_DISPLAY_DESCRIPTION,
        parseHTML: (element) => element.getAttribute('data-display-description'),
        renderHTML: (attributes) => {
          const description =
            typeof attributes.displayDescription === 'string'
              ? attributes.displayDescription.trim()
              : '';
          if (description === '') {
            return {};
          }
          return { 'data-display-description': description };
        },
      },
      coverSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cover-src'),
        renderHTML: (attributes) => {
          const cover =
            typeof attributes.coverSrc === 'string' && attributes.coverSrc.trim() !== ''
              ? attributes.coverSrc.trim()
              : null;
          if (cover == null) {
            return {};
          }
          return { 'data-cover-src': cover };
        },
      },
      textColor: {
        default: DEFAULT_AUDIO_TEXT_COLOR,
        parseHTML: (element) => element.getAttribute('data-text-color'),
        renderHTML: (attributes) => {
          const textColor =
            typeof attributes.textColor === 'string' ? attributes.textColor.trim() : '';
          if (textColor === '' || textColor === DEFAULT_AUDIO_TEXT_COLOR) {
            return {};
          }
          return { 'data-text-color': textColor };
        },
      },
      bgColor: {
        default: DEFAULT_AUDIO_BG_COLOR,
        parseHTML: (element) => element.getAttribute('data-bg-color'),
        renderHTML: (attributes) => {
          const bgColor = typeof attributes.bgColor === 'string' ? attributes.bgColor.trim() : '';
          if (bgColor === '' || bgColor === DEFAULT_AUDIO_BG_COLOR) {
            return {};
          }
          return { 'data-bg-color': bgColor };
        },
      },
      buttonHoverColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-button-hover-color'),
        renderHTML: (attributes) => {
          const buttonHoverColor =
            typeof attributes.buttonHoverColor === 'string'
              ? attributes.buttonHoverColor.trim()
              : '';
          if (buttonHoverColor === '') {
            return {};
          }
          return { 'data-button-hover-color': buttonHoverColor };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'audio[src]:not([src^="data:"])',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const src = element.getAttribute('src');
          if (src == null || src.startsWith('data:')) {
            return false;
          }
          const width = element.getAttribute('data-width');
          const height = element.getAttribute('data-height');
          const containerStyle = element.getAttribute('data-container-style');
          const displayTitle = element.getAttribute('data-display-title');
          const displayDescription = element.getAttribute('data-display-description');
          const coverSrc = element.getAttribute('data-cover-src');
          const textColor = element.getAttribute('data-text-color');
          const bgColor = element.getAttribute('data-bg-color');
          const buttonHoverColor = element.getAttribute('data-button-hover-color');
          return {
            src,
            ...(width != null && width.trim() !== '' ? { width } : {}),
            ...(height != null && height.trim() !== '' ? { height } : {}),
            ...(containerStyle != null && containerStyle.trim() !== ''
              ? { containerStyle }
              : {}),
            ...(displayTitle != null && displayTitle.trim() !== '' ? { displayTitle } : {}),
            ...(displayDescription != null && displayDescription.trim() !== ''
              ? { displayDescription }
              : {}),
            ...(coverSrc != null && coverSrc.trim() !== '' ? { coverSrc } : {}),
            ...(textColor != null && textColor.trim() !== '' ? { textColor } : {}),
            ...(bgColor != null && bgColor.trim() !== '' ? { bgColor } : {}),
            ...(buttonHoverColor != null && buttonHoverColor.trim() !== ''
              ? { buttonHoverColor }
              : {}),
          };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const widthDigits = dimensionDigits(node.attrs.width, normalizeWidthPx);
    const heightDigits = dimensionDigits(node.attrs.height, normalizeHeightPx);
    const containerStyle =
      typeof node.attrs.containerStyle === 'string' && node.attrs.containerStyle.trim() !== ''
        ? node.attrs.containerStyle
        : DEFAULT_AUDIO_CONTAINER_STYLE;
    const displayTitle =
      typeof node.attrs.displayTitle === 'string' ? node.attrs.displayTitle.trim() : '';
    const displayDescription =
      typeof node.attrs.displayDescription === 'string'
        ? node.attrs.displayDescription.trim()
        : '';
    const coverSrc =
      typeof node.attrs.coverSrc === 'string' && node.attrs.coverSrc.trim() !== ''
        ? node.attrs.coverSrc.trim()
        : null;
    const textColor =
      typeof node.attrs.textColor === 'string' ? node.attrs.textColor.trim() : DEFAULT_AUDIO_TEXT_COLOR;
    const bgColor =
      typeof node.attrs.bgColor === 'string' ? node.attrs.bgColor.trim() : DEFAULT_AUDIO_BG_COLOR;
    const buttonHoverColor =
      typeof node.attrs.buttonHoverColor === 'string'
        ? node.attrs.buttonHoverColor.trim()
        : '';
    return [
      'audio',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        ...(widthDigits != null ? { 'data-width': widthDigits } : {}),
        ...(heightDigits != null ? { 'data-height': heightDigits } : {}),
        'data-container-style': containerStyle,
        ...(displayTitle !== '' ? { 'data-display-title': displayTitle } : {}),
        ...(displayDescription !== '' ? { 'data-display-description': displayDescription } : {}),
        ...(coverSrc != null ? { 'data-cover-src': coverSrc } : {}),
        ...(textColor !== '' && textColor !== DEFAULT_AUDIO_TEXT_COLOR
          ? { 'data-text-color': textColor }
          : {}),
        ...(bgColor !== '' && bgColor !== DEFAULT_AUDIO_BG_COLOR ? { 'data-bg-color': bgColor } : {}),
        ...(buttonHoverColor !== '' ? { 'data-button-hover-color': buttonHoverColor } : {}),
      }),
    ];
  },
  addCommands() {
    return {
      setAudio:
        (options: AudioAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: mergeDefaultAudioInsertLayout(options),
          });
        },
    };
  },
});

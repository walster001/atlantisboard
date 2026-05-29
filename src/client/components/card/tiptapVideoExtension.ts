import { mergeAttributes, Node } from '@tiptap/core';

export interface VideoAttributes {
  src: string;
  poster?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    video: {
      setVideo: (options: VideoAttributes) => ReturnType;
    };
  }
}

export const TiptapVideo = Node.create({
  name: 'video',
  draggable: true,
  inline: false,
  group: 'block',
  addOptions() {
    return {
      allowBase64: false,
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      src: {
        default: null,
      },
      poster: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'video[src]:not([src^="data:"])',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const src = element.getAttribute('src');
          if (src == null || src.startsWith('data:')) {
            return false;
          }
          const poster = element.getAttribute('poster');
          return {
            src,
            ...(poster != null && poster !== '' ? { poster } : {}),
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
  addCommands() {
    return {
      setVideo:
        (options: VideoAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

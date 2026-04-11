import { mergeAttributes, Node } from '@tiptap/core';

export interface VideoAttributes {
  src: string;
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
    };
  },
  parseHTML() {
    return [{ tag: 'video[src]:not([src^="data:"])' }];
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

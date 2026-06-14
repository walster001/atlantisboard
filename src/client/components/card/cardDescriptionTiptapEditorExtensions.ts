import { type Extensions } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { CardDescriptionAudioNodeView } from './CardDescriptionAudioNodeView.js';
import { CardDescriptionVideoNodeView } from './CardDescriptionVideoNodeView.js';
import { TiptapAudio } from './tiptapAudioExtension.js';
import { TiptapVideo } from './tiptapVideoExtension.js';
import { getCardDescriptionExtensions } from './cardDescriptionTiptap.impl.js';

let cachedAudioEditorExtension: Extensions[number] | undefined;
let cachedVideoEditorExtension: Extensions[number] | undefined;

function getTiptapVideoEditorExtension(): Extensions[number] {
  if (cachedVideoEditorExtension) {
    return cachedVideoEditorExtension;
  }
  cachedVideoEditorExtension = TiptapVideo.configure({
    HTMLAttributes: {
      controls: true,
      playsinline: true,
      preload: 'metadata',
      class: 'card-desc-video-player',
    },
  }).extend({
    addNodeView() {
      return ReactNodeViewRenderer(CardDescriptionVideoNodeView);
    },
  });
  return cachedVideoEditorExtension;
}

function getTiptapAudioEditorExtension(): Extensions[number] {
  if (cachedAudioEditorExtension) {
    return cachedAudioEditorExtension;
  }
  cachedAudioEditorExtension = TiptapAudio.configure({
    HTMLAttributes: {
      preload: 'metadata',
      class: 'card-desc-audio-player',
    },
  }).extend({
    addNodeView() {
      return ReactNodeViewRenderer(CardDescriptionAudioNodeView, {
        stopEvent: ({ event }) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return false;
          }
          return target.closest('.card-desc-audio-node-view') != null;
        },
      });
    },
  });
  return cachedAudioEditorExtension;
}

/** Editor extensions: schema + placeholder + React node views for audio/video. */
export function getCardDescriptionEditorExtensions(placeholder: string): Extensions {
  const base = getCardDescriptionExtensions().filter(
    (ext) => ext.name !== 'video' && ext.name !== 'audio',
  );
  return [
    ...base,
    getTiptapVideoEditorExtension(),
    getTiptapAudioEditorExtension(),
    Placeholder.configure({ placeholder }),
  ];
}

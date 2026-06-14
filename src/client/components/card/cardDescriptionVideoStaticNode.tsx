import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import { CardDescriptionReadonlyVideo } from './cardDescriptionReadonlyVideo.js';

export function renderCardDescriptionVideoStaticNode({ node }: { readonly node: PMNode }) {
  const attrs = node.attrs as { src?: unknown; poster?: unknown };
  const src = typeof attrs.src === 'string' ? attrs.src.trim() : '';
  if (src === '') {
    return null;
  }
  const poster = typeof attrs.poster === 'string' ? attrs.poster.trim() : '';
  return createElement(CardDescriptionReadonlyVideo, {
    src,
    ...(poster !== '' ? { poster } : {}),
    className: 'card-desc-video-player',
  });
}

import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import { CardDescriptionReadonlyVideo } from './cardDescriptionReadonlyVideo.js';

export function renderCardDescriptionVideoStaticNode({ node }: { readonly node: PMNode }) {
  const attrs = node.attrs as { src?: unknown };
  const src = typeof attrs.src === 'string' ? attrs.src.trim() : '';
  if (src === '') {
    return null;
  }
  return createElement(CardDescriptionReadonlyVideo, {
    src,
    className: 'card-desc-video-player',
  });
}

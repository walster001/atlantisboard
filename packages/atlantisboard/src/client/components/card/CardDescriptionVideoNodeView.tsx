import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { CardDescriptionVideoPlayer } from './CardDescriptionVideoPlayer.js';

export function CardDescriptionVideoNodeView({ node }: NodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src.trim() : '';

  if (src === '') {
    return null;
  }

  return (
    <NodeViewWrapper className="card-desc-video-node-view" data-drag-handle>
      <CardDescriptionVideoPlayer src={src} className="card-desc-video-player" />
    </NodeViewWrapper>
  );
}
